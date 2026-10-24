import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, QrCodeIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import type { ShareableLink } from "~/lib/browser";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function useCopy() {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: async (text: string, message = "Copied to clipboard") => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(message);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        toast.error("Clipboard is not available");
      }
    },
  };
}

/** Access links are credentials: masked until explicitly revealed. */
export function AccessLink({ link: shareable, revealed = false }: { link: ShareableLink; revealed?: boolean }) {
  const [show, setShow] = useState(revealed);
  const [qr, setQr] = useState(revealed);
  const { copied, copy } = useCopy();
  const link = shareable.url;

  return (
    <div className="space-y-3">
      <InputGroup>
        <InputGroupInput readOnly value={show ? link : shareable.masked} className="font-mono" aria-label="Access link" />
        <InputGroupAddon align="inline-end">
          <IconButton label={show ? "Hide link" : "Reveal link"} onClick={() => setShow((v) => !v)}>
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </IconButton>
          <IconButton label={qr ? "Hide QR code" : "Show QR code"} onClick={() => setQr((v) => !v)}>
            <QrCodeIcon />
          </IconButton>
          <IconButton label="Copy link" onClick={() => copy(link, "Access link copied")}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
        </InputGroupAddon>
      </InputGroup>
      {qr && (
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 ring-1 ring-foreground/10">
            <QRCodeSVG value={link} size={148} marginSize={0} />
          </div>
          <p className="max-w-56 text-xs text-muted-foreground">
            Scan with the Outline app, or send the link through a private channel. Anyone with it can connect.
          </p>
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<InputGroupButton size="icon-xs" onClick={onClick} aria-label={label} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
