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
  } else if (ns.ramOverride() < 32) {
    limitedMode(ns);
  } else {
    batcherMode(ns);
  }
}

/**
 * The servers accessible on the regular network, not including the darknet.
 */
type Network = Map<string, Required<Server>>;

/**
 * Simply will run the operation on the server. Often
 */
async function remotesMode(ns: NS) {}

/**
 * This limited mode of the batcher is designed just for initial bootstrapping, and is very RAM constrained.
 */
async function limitedMode(ns: NS) {
  ns.tprint(
    "Batcher running in limited mode. Upgrade your home RAM to 32GB or higher to unlock full functionality.",
  );

  const network: Network = initNetwork(ns);

  // Less RAM than actually getting the script name...
  const myFilename: string = "miniburn.ts";

  ns.atExit(() => {
    for (const server of network.keys()) {
      ns.scriptKill(myFilename, server);
    }
  });

  {
    const network = pwnNetwork(ns);
    for (const [serverName, server] of network) {
      if (server.hasAdminRights) {
        ns.tprint(`${serverName} has ${server.maxRam}GB`);
      }
    }
  }
}

/**
 * The main batcher!
 */
async function batcherMode(ns: NS) {}

/**
 * Populate the network without changing it.
 */
function initNetwork(ns: NS): Network {
  const unscannedServers = new Array<string>("home");
  const result: Network = new Map();
  while (unscannedServers.length > 0) {
    const serverToScan: string = unscannedServers.pop()!;
    result.set(serverToScan, ns.getServer(serverToScan) as Required<Server>);
    for (const server of ns.scan(serverToScan)) {
      if (!result.has(server)) {
        unscannedServers.push(server);
      }
    }
  }
  return result;
}

/**
 * Populate the network, but also attempt to get root on boxes.
 */
function pwnNetwork(ns: NS): Network {
  const result: Network = initNetwork(ns);
  for (const [serverName, server] of result) {
    if (!server.hasAdminRights) {
      ns.brutessh(serverName);
      ns.ftpcrack(serverName);
      ns.relaysmtp(serverName);
      ns.httpworm(serverName);
      ns.sqlinject(serverName);
      ns.nuke(serverName);
      if (ns.hasRootAccess(serverName)) {
        server.hasAdminRights = true;
      }
    }
  }
  return result;
}

/**
 * Pick the most ideal target to extract money from.
 */
function selectTarget(ns: NS, network: Network): string {
  return "n00dles";
}

/**
 * Extract money from the target.
 */
async function farmTarget(ns: NS, network: Network, target: String) {}
