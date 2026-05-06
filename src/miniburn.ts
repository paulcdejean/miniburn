/** @param {NS} ns */
/**
 * The entry point switches between 3 modes of running:
 * 1. Batcher mode. This is the main mode, it manages everything needed to hack lots of money.
 * 2. Limited mode. This is a bare bones hacker/batcher designed for when home has less than 64GB of RAM.
 * 3. Remotes mode. In order to keep this batcher as a single script. The 2GB remotes that run the HGW operations run in the same script.
 */
export async function main(ns: NS) {
  const remotes_type = new Set(["hack", "grow", "weaken", "share"]);

  if (
    ns.args.length > 0 &&
    typeof ns.args[0] === "string" &&
    remotes_type.has(ns.args[0])
  ) {
    remotes_mode(ns);
  }

  ns.tprint("Hello world!");
}

async function remotes_mode(ns: NS) {}
