import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Clipboard API failed', err);
        }
    }

    // Fallback for HTTP / non-secure contexts
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
    } catch (err) {
        console.error('Fallback copy failed', err);
        document.body.removeChild(textArea);
        return false;
    }
}
