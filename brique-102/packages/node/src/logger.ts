/**
 * Minimal logger that can be replaced/injected by host app
 */
export class Logger {
  static info(msg: string, meta?: any) {
    if (process.env.MOLAM_LOG_LEVEL !== "error") {
      console.log(`[molam:info] ${msg}`, meta ?? "");
    }
  }

  static warn(msg: string, meta?: any) {
    console.warn(`[molam:warn] ${msg}`, meta ?? "");
  }

  static error(msg: string, meta?: any) {
    console.error(`[molam:error] ${msg}`, meta ?? "");
  }
}
