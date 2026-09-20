const SAFE_ERROR_CODE = /^[A-Z0-9_]{1,100}$/;

function responseData(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return null;
  }
  const response = error.response;
  if (
    typeof response !== "object" ||
    response === null ||
    !("data" in response)
  ) {
    return null;
  }
  return response.data;
}

export function plaidErrorCode(error: unknown): string | null {
  const data = responseData(error);
  if (typeof data !== "object" || data === null || !("error_code" in data)) {
    return null;
  }
  const code = data.error_code;
  return typeof code === "string" && SAFE_ERROR_CODE.test(code) ? code : null;
}

export function sanitizedPlaidError(error: unknown) {
  const code = plaidErrorCode(error);
  return {
    code,
    message: code ? `Plaid request failed (${code}).` : "Plaid request failed."
  };
}
