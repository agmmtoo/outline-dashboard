import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export interface ConfirmRequest {
  title: string;
  description: string;
  action: string;
  destructive?: boolean;
  /** Text the user must type before the action button enables (e.g. the key's name). */
  confirmText?: string;
  onConfirm: () => void;
}

/** Controlled confirmation; pass `null` to close. */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <AlertDialog open={request != null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        {/* Keyed so the typed text resets for every request. */}
        {request && <ConfirmBody key={request.title} request={request} onClose={onClose} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmBody({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const ready = request.confirmText == null || typed.trim() === request.confirmText;
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{request.title}</AlertDialogTitle>
        <AlertDialogDescription>{request.description}</AlertDialogDescription>
      </AlertDialogHeader>
      {request.confirmText != null && (
        <Field>
          <FieldLabel htmlFor="confirm-text">
            Type <span className="font-mono font-semibold">{request.confirmText}</span> to confirm
          </FieldLabel>
          <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
        </Field>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant={request.destructive ? "destructive" : "default"}
          disabled={!ready}
          onClick={() => {
            request.onConfirm();
            onClose();
          }}
        >
          {request.action}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
