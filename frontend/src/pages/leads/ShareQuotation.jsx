// Sharing a quotation PDF from the web. Where the browser can share files (Chrome / Edge on
// Windows, Android, ChromeOS; Safari) the system share sheet opens with the PDF attached - WhatsApp,
// Mail, Nearby Share... Elsewhere a small panel offers WhatsApp / Email / Download: a browser cannot
// attach a file to WhatsApp Web or an email by itself, so the PDF is downloaded to attach.

import { FiDownload, FiMail, FiMessageCircle } from "react-icons/fi";
import { download, waNumber } from "./shareFile";
import { Button, Modal, Note } from "./ui";

/** For browsers without file sharing: WhatsApp / Email / Download, each with the PDF downloaded to attach. */
export function ShareFallback({ file, text, phone, email, onClose }) {
  const whatsapp = () => {
    download(file);
    const to = waNumber(phone);
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    onClose();
  };
  const mail = () => {
    download(file);
    window.location.href = `mailto:${email || ""}?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n\nPlease find the quotation attached.`)}`;
    onClose();
  };
  return (
    <Modal title="Share quotation" sub={file.name} onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <Note tone="info">This browser cannot attach files by itself, so the PDF is downloaded - attach it in WhatsApp or the email that opens.</Note>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <Button icon={<FiMessageCircle />} onClick={whatsapp}>
            WhatsApp
          </Button>
          <Button variant="ghost" icon={<FiMail />} onClick={mail}>
            Email
          </Button>
          <Button
            variant="ghost"
            icon={<FiDownload />}
            onClick={() => {
              download(file);
              onClose();
            }}
          >
            Download
          </Button>
        </div>
      </div>
    </Modal>
  );
}
