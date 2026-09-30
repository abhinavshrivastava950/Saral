import type { Metadata } from "next";
import {VoiceSessionProvider} from "@/components/voice-session";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/500.css";
import "@fontsource/noto-sans-devanagari/600.css";
import "./globals.css";
import "./chat.css";
import "./experience.css";
import "./demo-workspace.css";
import "./voice-session.css";

export const metadata: Metadata = {
  title: "Saral — Your salary. Your taxes. Simplified.",
  description: "A guided ITR preparation workspace for India's salaried government employees. Start with a conversation, not a form.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><VoiceSessionProvider>{children}</VoiceSessionProvider></body></html>;
}
