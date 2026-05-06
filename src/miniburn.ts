/** @param {NS} ns */
/**
 * The entry point switches between 3 modes of running:
 * 1. Batcher mode. This is the main mode, it manages everything needed to hack lots of money.
 * 2. Limited mode. This is a bare bones hacker/batcher designed for when home has less than 64GB of RAM.
 * 3. Remotes mode. In order to keep this batcher as a single script. The 2GB remotes that run the HGW operations run in the same script.
 */
export async function main(ns: NS) {
  const remote_types = new Set(["hack", "grow", "weaken", "share"]);

  if (
    ns.args.length > 0 &&
    typeof ns.args[0] === "string" &&
    remote_types.has(ns.args[0])
  ) {
    remotesMode(ns);
  } else if ((ns.getRunningScript()?.dynamicRamUsage ?? 0) < 32) {
    limitedMode(ns);
  } else {
    batcherMode(ns);
  }
}

type Network = Map<string, Required<Server>>;

async function remotesMode(ns: NS) {}

/**
 * This limited mode of the batcher is designed just for initial bootstrapping, and is very RAM constrained.
 */
async function limitedMode(ns: NS) {
  ns.tprint(
    "Batcher running in limited mode. Upgrade your home RAM to 32GB or higher to unlock full functionality.",
  );

  let network: Network = initNetwork(ns);

  while (true) {
    pwnNetwork(ns, network);
  }
}

async function batcherMode(ns: NS) {}

function initNetwork(ns: NS): Network {
  const result = new Map();
  return result;
}

function pwnNetwork(ns: NS, network: Network) {}
