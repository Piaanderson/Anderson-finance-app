import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const mocks = vi.hoisted(() => ({
  activeOwner: {
    userId: "",
    householdId: "",
    role: "OWNER" as const
  },
  linkTokenCreate: vi.fn(),
  itemRemove: vi.fn()
}));

vi.mock("@/server/households", () => ({
  requireApiHousehold: vi.fn(async () => mocks.activeOwner)
}));

vi.mock("@/server/plaid/client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/plaid/client")>();
  return {
    ...original,
    plaid: {
      linkTokenCreate: mocks.linkTokenCreate,
      itemRemove: mocks.itemRemove
    }
  };
});

import { POST as createLinkToken } from "@/app/api/plaid/link-token/route";
import {
  DELETE as disconnectItem,
  POST as refreshItem
} from "@/app/api/plaid/items/[itemId]/route";
import { prisma } from "@/server/db";
import { encryptSecret } from "@/server/secrets";

const key = `plaid-lifecycle-${randomUUID()}`;
const ids = {
  ownerUser: `${key}-owner-user`,
  foreignUser: `${key}-foreign-user`,
  ownerHousehold: `${key}-owner-household`,
  foreignHousehold: `${key}-foreign-household`,
  ownerItem: `${key}-owner-item`,
  foreignItem: `${key}-foreign-item`,
  ownerAccount: `${key}-owner-account`
};
const routeContext = (itemId: string) => ({
  params: Promise.resolve({ itemId })
});
let ownerSecret: ReturnType<typeof encryptSecret>;
let foreignSecret: ReturnType<typeof encryptSecret>;

function linkTokenRequest(itemId?: string, body?: string) {
  return new Request("http://currents.test/api/plaid/link-token", {
    method: "POST",
    headers: itemId || body ? { "content-type": "application/json" } : {},
    body: body ?? (itemId ? JSON.stringify({ itemId }) : undefined)
  });
}

beforeAll(async () => {
  process.env.PLAID_CLIENT_ID = "test-client";
  process.env.PLAID_SECRET = "test-secret";
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  process.env.TOKEN_ENCRYPTION_KEY_VERSION = "1";
  ownerSecret = encryptSecret("owned-access-token");
  foreignSecret = encryptSecret("foreign-access-token");
  mocks.activeOwner.userId = ids.ownerUser;
  mocks.activeOwner.householdId = ids.ownerHousehold;

  await prisma.user.createMany({
    data: [
      { id: ids.ownerUser, email: `${key}-owner@example.test` },
      { id: ids.foreignUser, email: `${key}-foreign@example.test` }
    ]
  });
  await prisma.household.createMany({
    data: [
      { id: ids.ownerHousehold, name: "Lifecycle owner" },
      { id: ids.foreignHousehold, name: "Lifecycle foreign" }
    ]
  });
  await prisma.householdMember.createMany({
    data: [
      {
        id: `${key}-owner-membership`,
        householdId: ids.ownerHousehold,
        userId: ids.ownerUser,
        role: "OWNER"
      },
      {
        id: `${key}-foreign-membership`,
        householdId: ids.foreignHousehold,
        userId: ids.foreignUser,
        role: "OWNER"
      }
    ]
  });
  await prisma.plaidItem.createMany({
    data: [
      {
        id: ids.ownerItem,
        householdId: ids.ownerHousehold,
        linkedByUserId: ids.ownerUser,
        plaidItemId: `${key}-owner-plaid-item`,
        institutionName: "Owner bank",
        accessTokenCiphertext: ownerSecret.ciphertext,
        accessTokenIv: ownerSecret.iv,
        accessTokenTag: ownerSecret.tag,
        encryptionKeyVersion: ownerSecret.keyVersion
      },
      {
        id: ids.foreignItem,
        householdId: ids.foreignHousehold,
        linkedByUserId: ids.foreignUser,
        plaidItemId: `${key}-foreign-plaid-item`,
        institutionName: "Foreign bank",
        accessTokenCiphertext: foreignSecret.ciphertext,
        accessTokenIv: foreignSecret.iv,
        accessTokenTag: foreignSecret.tag,
        encryptionKeyVersion: foreignSecret.keyVersion
      }
    ]
  });
  await prisma.financialAccount.create({
    data: {
      id: ids.ownerAccount,
      householdId: ids.ownerHousehold,
      plaidItemId: ids.ownerItem,
      plaidAccountId: `${key}-owner-plaid-account`,
      source: "PLAID",
      classification: "CASH",
      name: "Owner checking",
      type: "depository"
    }
  });
});

beforeEach(async () => {
  mocks.linkTokenCreate.mockReset();
  mocks.itemRemove.mockReset();
  await prisma.syncJob.deleteMany({
    where: { plaidItemId: { in: [ids.ownerItem, ids.foreignItem] } }
  });
  await prisma.plaidItem.update({
    where: { id: ids.ownerItem },
    data: {
      status: "ACTIVE",
      errorCode: null,
      accessTokenCiphertext: ownerSecret.ciphertext,
      accessTokenIv: ownerSecret.iv,
      accessTokenTag: ownerSecret.tag,
      encryptionKeyVersion: ownerSecret.keyVersion
    }
  });
  await prisma.financialAccount.update({
    where: { id: ids.ownerAccount },
    data: { isActive: true }
  });
});

afterAll(async () => {
  await prisma.household.deleteMany({
    where: { id: { in: [ids.ownerHousehold, ids.foreignHousehold] } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.ownerUser, ids.foreignUser] } }
  });
  await prisma.$disconnect();
});

describe("Plaid Link token lifecycle", () => {
  it("keeps new connection Link tokens in create mode", async () => {
    mocks.linkTokenCreate.mockResolvedValue({
      data: { link_token: "create-link-token" }
    });

    const response = await createLinkToken(linkTokenRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      linkToken: "create-link-token",
      mode: "create"
    });
    expect(mocks.linkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        products: ["transactions"],
        additional_consented_products: ["liabilities", "investments"]
      })
    );
  });

  it("creates household-owned update-mode tokens from the existing access token", async () => {
    mocks.linkTokenCreate.mockResolvedValue({
      data: { link_token: "update-link-token" }
    });

    const response = await createLinkToken(linkTokenRequest(ids.ownerItem));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      linkToken: "update-link-token",
      mode: "update"
    });
    const request = mocks.linkTokenCreate.mock.calls[0][0];
    expect(request).toMatchObject({
      access_token: "owned-access-token",
      user: { client_user_id: ids.ownerUser }
    });
    expect(request).not.toHaveProperty("products");
    expect(request).not.toHaveProperty("additional_consented_products");
  });

  it("rejects a foreign update-mode Item before decrypting or calling Plaid", async () => {
    const response = await createLinkToken(linkTokenRequest(ids.foreignItem));

    expect(response.status).toBe(404);
    expect(mocks.linkTokenCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed update-mode requests without calling Plaid", async () => {
    const response = await createLinkToken(
      linkTokenRequest(undefined, '{"itemId":')
    );

    expect(response.status).toBe(400);
    expect(mocks.linkTokenCreate).not.toHaveBeenCalled();
  });
});

describe("Plaid Item lifecycle actions", () => {
  it("queues a manual refresh for an owned active Item", async () => {
    const response = await refreshItem(
      new Request("http://currents.test/api/plaid/items", { method: "POST" }),
      routeContext(ids.ownerItem)
    );

    expect(response.status).toBe(202);
    await expect(
      prisma.syncJob.findUnique({
        where: { dedupeKey: `plaid-sync:${ids.ownerItem}` }
      })
    ).resolves.toMatchObject({
      plaidItemId: ids.ownerItem,
      reason: "MANUAL",
      status: "PENDING"
    });
  });

  it("disconnects at Plaid and atomically deactivates accounts and queued work", async () => {
    mocks.itemRemove.mockResolvedValue({ data: {} });
    await prisma.syncJob.create({
      data: {
        id: `${key}-disconnect-job`,
        plaidItemId: ids.ownerItem,
        dedupeKey: `plaid-sync:${ids.ownerItem}`,
        reason: "MANUAL",
        status: "RUNNING",
        lockedAt: new Date()
      }
    });

    const response = await disconnectItem(
      new Request("http://currents.test/api/plaid/items", { method: "DELETE" }),
      routeContext(ids.ownerItem)
    );

    expect(response.status).toBe(204);
    expect(mocks.itemRemove).toHaveBeenCalledWith({
      access_token: "owned-access-token"
    });
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: ids.ownerItem } })
    ).resolves.toMatchObject({
      status: "REMOVED",
      accessTokenCiphertext: "",
      accessTokenIv: "",
      accessTokenTag: "",
      errorCode: null
    });
    await expect(
      prisma.financialAccount.findUniqueOrThrow({
        where: { id: ids.ownerAccount }
      })
    ).resolves.toMatchObject({ isActive: false });
    await expect(
      prisma.syncJob.findUniqueOrThrow({
        where: { dedupeKey: `plaid-sync:${ids.ownerItem}` }
      })
    ).resolves.toMatchObject({
      status: "FAILED",
      lockedAt: null,
      lastError: "Canceled because the connection was disconnected."
    });
  });

  it("keeps local data active and sanitizes logs when Plaid removal fails", async () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.itemRemove.mockRejectedValue({
      response: {
        data: {
          error_code: "INSTITUTION_NOT_RESPONDING",
          access_token: "owned-access-token",
          account_name: "Owner checking"
        }
      }
    });

    const response = await disconnectItem(
      new Request("http://currents.test/api/plaid/items", { method: "DELETE" }),
      routeContext(ids.ownerItem)
    );

    expect(response.status).toBe(502);
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: ids.ownerItem } })
    ).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(
      prisma.financialAccount.findUniqueOrThrow({
        where: { id: ids.ownerAccount }
      })
    ).resolves.toMatchObject({ isActive: true });
    const logs = JSON.stringify(errorLog.mock.calls);
    expect(logs).toContain("INSTITUTION_NOT_RESPONDING");
    expect(logs).not.toContain("owned-access-token");
    expect(logs).not.toContain("Owner checking");
  });
});
