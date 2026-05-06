import * as bitburner from "./NetscriptDefinitions";

declare global {
  /**
   * Collection of all functions passed to scripts
   * @public
   * @remarks
   * <b>Basic usage example:</b>
   * ```js
   * export async function main(ns) {
   *  // Basic ns functions can be accessed on the ns object
   *  ns.getHostname();
   *  // Some related functions are gathered under a sub-property of the ns object
   *  ns.stock.getPrice();
   *  // Most functions that return a promise need to be awaited.
   *  await ns.hack('n00dles');
   * }
   * ```
   */
  interface NS extends bitburner.NS {}
  /**
   * A server. Not all servers have all of these properties - optional properties are missing on certain servers.
   * @public
   */
  interface Server extends bitburner.Server {}
}

export {};
