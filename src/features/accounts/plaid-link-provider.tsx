"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  usePlaidLink,
  type PlaidLinkError,
  type PlaidLinkOnExitMetadata,
  type PlaidLinkOnSuccessMetadata
} from "react-plaid-link";

type LinkSession = {
  itemId?: string;
  onSuccess: (
    publicToken: string | null,
    metadata: PlaidLinkOnSuccessMetadata
  ) => void | Promise<void>;
  onExit: (
    error: PlaidLinkError | null,
    metadata: PlaidLinkOnExitMetadata
  ) => void;
  onUnavailable: () => void;
};

type PlaidLinkContextValue = {
  startLink: (session: LinkSession) => Promise<void>;
};

const PlaidLinkContext = createContext<PlaidLinkContextValue | null>(null);

function PlaidLinkLauncher({
  token,
  onSuccess,
  onExit,
  onUnavailable
}: {
  token: string;
  onSuccess: (
    publicToken: string | null,
    metadata: PlaidLinkOnSuccessMetadata
  ) => void;
  onExit: (
    error: PlaidLinkError | null,
    metadata: PlaidLinkOnExitMetadata
  ) => void;
  onUnavailable: () => void;
}) {
  const opened = useRef(false);
  const unavailable = useRef(false);
  const { error, open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit
  });

  useEffect(() => {
    if (error && !unavailable.current) {
      unavailable.current = true;
      onUnavailable();
      return;
    }
    if (ready && !opened.current) {
      opened.current = true;
      open();
    }
  }, [error, onUnavailable, open, ready]);

  return null;
}

export function PlaidLinkProvider({ children }: { children: ReactNode }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const session = useRef<LinkSession | null>(null);

  const onSuccess = useCallback(
    async (
      publicToken: string | null,
      metadata: PlaidLinkOnSuccessMetadata
    ) => {
      const activeSession = session.current;
      session.current = null;
      setLinkToken(null);
      await activeSession?.onSuccess(publicToken, metadata);
    },
    []
  );

  const onExit = useCallback(
    (error: PlaidLinkError | null, metadata: PlaidLinkOnExitMetadata) => {
      const activeSession = session.current;
      session.current = null;
      setLinkToken(null);
      activeSession?.onExit(error, metadata);
    },
    []
  );

  const onUnavailable = useCallback(() => {
    const activeSession = session.current;
    session.current = null;
    setLinkToken(null);
    activeSession?.onUnavailable();
  }, []);

  const startLink = useCallback(async (nextSession: LinkSession) => {
    if (session.current) {
      throw new Error("Plaid Link is already open.");
    }
    session.current = nextSession;
    try {
      const response = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: nextSession.itemId
          ? { "content-type": "application/json" }
          : undefined,
        body: nextSession.itemId
          ? JSON.stringify({ itemId: nextSession.itemId })
          : undefined
      });
      if (!response.ok) throw new Error("link-token");
      const body = (await response.json()) as { linkToken: string };
      setLinkToken(body.linkToken);
    } catch (error) {
      session.current = null;
      throw error;
    }
  }, []);

  const value = useMemo(() => ({ startLink }), [startLink]);

  return (
    <PlaidLinkContext.Provider value={value}>
      {children}
      {linkToken ? (
        <PlaidLinkLauncher
          token={linkToken}
          onSuccess={onSuccess}
          onExit={onExit}
          onUnavailable={onUnavailable}
        />
      ) : null}
    </PlaidLinkContext.Provider>
  );
}

export function usePlaidConnectionManager() {
  const context = useContext(PlaidLinkContext);
  if (!context) {
    throw new Error(
      "usePlaidConnectionManager must be used within PlaidLinkProvider."
    );
  }
  return context;
}
