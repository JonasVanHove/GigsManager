"use client";

import ConfirmDialog from "./ConfirmDialog";

interface DeleteConfirmProps {
  gigName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirm({
  gigName,
  onConfirm,
  onCancel,
}: DeleteConfirmProps) {
  return (
    <ConfirmDialog
      isOpen={true}
      title="Delete Performance"
      message={`Are you sure you want to delete "${gigName}"? This action cannot be undone and will remove all associated financial records.`}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      confirmVariant="danger"
      icon="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
