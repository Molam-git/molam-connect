/**
 * BRIQUE TRANSLATION — React Translation Hook
 */
import { useEffect, useState } from "react";
import { api } from "../utils/api";

export function useTranslator(
  text: string,
  sourceLang: string,
  targetLang: string,
  namespace = "default"
) {
  const [translated, setTranslated] = useState<string>(text);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!text) {
      setTranslated("");
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await api.translate(text, sourceLang, targetLang, namespace);
        if (mounted && data?.text) {
          setTranslated(data.text);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message);
          setTranslated(text); // fallback to source
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [text, sourceLang, targetLang, namespace]);

  return { translated, loading, error };
}
