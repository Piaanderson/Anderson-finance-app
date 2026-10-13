"use client";

export function ManualAccountEditTrigger({
  accountName,
  supportDetailsId,
  editDetailsId
}: {
  accountName: string;
  supportDetailsId: string;
  editDetailsId: string;
}) {
  function openEditor() {
    const supportDetails = document.getElementById(
      supportDetailsId
    ) as HTMLDetailsElement | null;
    const editDetails = document.getElementById(
      editDetailsId
    ) as HTMLDetailsElement | null;
    if (!supportDetails || !editDetails) return;
    supportDetails.open = true;
    editDetails.open = true;
    requestAnimationFrame(() => {
      editDetails
        .querySelector<HTMLInputElement>('input[name="name"]')
        ?.focus();
    });
  }

  return (
    <button
      className="button secondary"
      type="button"
      onClick={openEditor}
      aria-controls={`${supportDetailsId} ${editDetailsId}`}
    >
      Rename <span className="visually-hidden">{accountName}</span>
    </button>
  );
}
