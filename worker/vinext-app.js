import handler from "vinext/server/fetch-handler";

globalThis[Symbol.for("gacha-lens.vinext-fallback-loaded")] = true;

export default handler;
