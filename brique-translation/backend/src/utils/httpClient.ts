/**
 * BRIQUE TRANSLATION — HTTP Client for LibreTranslate
 */
import axios from "axios";

export async function postTranslate(
  apiBase: string,
  q: string,
  source: string,
  target: string
): Promise<{ translatedText: string }> {
  const url = `${apiBase}/translate`;

  // LibreTranslate expects: { q, source, target, format }
  const resp = await axios.post(url, {
    q,
    source,
    target,
    format: "text"
  }, {
    timeout: 8000,
    headers: { 'Content-Type': 'application/json' }
  });

  return resp.data;
}
