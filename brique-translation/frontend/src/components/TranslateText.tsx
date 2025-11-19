/**
 * BRIQUE TRANSLATION — Simple Translation Component
 */
import React from "react";
import { useTranslator } from "../hooks/useTranslator";

interface TranslateTextProps {
  text: string;
  sourceLang: string;
  targetLang: string;
  namespace?: string;
}

export default function TranslateText({
  text,
  sourceLang,
  targetLang,
  namespace = "default"
}: TranslateTextProps) {
  const { translated, loading } = useTranslator(text, sourceLang, targetLang, namespace);

  return (
    <span className={loading ? "opacity-50" : ""}>
      {translated}
    </span>
  );
}
