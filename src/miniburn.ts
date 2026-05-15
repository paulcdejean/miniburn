/** The maximum number of scripts that can be launched by this batcher. For stability purposes. */
const SCRIPT_LIMIT = 400100;
/** The first port number this batcher will use. The last port number is STARTING_PORT + SCRIPT_LIMIT */
const STARTING_PORT = 2000;
/** The ServerWeakenAmount constant in the games code. */
const WEAKEN_SEC = 0.05;
/** The ServerFortifyAmount constant in the games code. */
const HG_SEC = 0.004;

/**
 * The things a remote script can do.
 */
enum Action {
  hack = "hack",
  grow = "grow",
  weaken = "weaken",
  share = "share",
}

/**
 * We just hardcode these because they never change.
 */
const ActionRam = {
  hack: 1.7,
  grow: 1.75,
  weaken: 1.75,
  share: 4,
};

/** @param {NS} ns */
/**
 * The entry point switches between 3 modes of running:
 * 1. Batcher mode. This is the main mode, it manages everything needed to hack lots of money.
 * 2. Limited mode. This is a bare bones hacker/batcher designed for when home has less than 64GB of RAM.
 * 3. Remotes mode. In order to keep this batcher as a single script. The 2GB remotes that run the HGW operations run in the same script.
 */
export async function main(ns: NS) {
  const remote_types = new Set(Object.keys(Action));

  if (
    ns.args.length > 0 &&
    typeof ns.args[0] === "string" &&
    remote_types.has(ns.args[0])
  ) {
    await remotesMode(ns);
  } else if (ns.ramOverride() <= 8) {
    ns.atExit(() => {
      for (const server of getServerList(ns)) {
        if (server !== "home") {
          ns.scriptKill(ns.getScriptName(), server);
        }
      }
      ns.scriptKill(ns.getScriptName());
    });
    await limitedMode(ns);
  } else {
    ns.atExit(() => {
      for (const server of getServerList(ns)) {
        if (server !== "home") {
          ns.scriptKill(ns.getScriptName(), server);
        }
      }
      ns.scriptKill(ns.getScriptName());
    });
    await mainMode(ns);
  }
}

/**
 * At a very high level, this is how a very basic batcher works!
 * There's some intermediate concepts that this pattern won't support, such as optimizing for home CPU cores.
 * There's also some advanced concepts that this pattern won't support such as just in time batching.
 */
interface BatcherAlgo {
  // The first step in a basic batcher is to build out a network, which contains servers you can hack money from or run scripts on.
  buildNetwork: NetworkBuilderAlgo;
  // The second step in a basic batcher is to select a target on the network to extract money from.
  selectTarget: TargetSelectionAlgo;
  // The third step in a basic batcher is to select how many threads per batch to hack the target with.
  pickHackThreads: HackingThreadAlgo;
  // The fourth step in a basic batcher is to pick the cycle time.
  pickCycleTime: CycleTimeAlgo;
  // The final step in a basic batcher, is to run the batcher tasks. For example weakening or HWGW farming.
  tasks: BatcherTask[];
}

/**
 * The servers accessible on the network.
 */
type Network = Map<string, Required<Server>>;

/**
 * A network builder algorithm take no input and returns a Network.
 * Basic example: Pwns servers.
 * Intermediate exmaple: Pwns servers, purchases servers.
 * Advanced example: Pwns servers, purchases servers, also leverages stasis linked darknet servers.
 */
type NetworkBuilderAlgo = (ns: NS) => Network;

/**
 * A target selection algorithm picks which server on the network is optimal to extract money from.
 * Basic example: Wildly guesses which one is optimal.
 * Intermediate example: Uses formulas to figure out which server give the best returns.
 * Advanced example: Optimally figures out which server gives the best returns, also accounting for exp growth.
 */
type TargetSelectionAlgo = (ns: NS, network: Network) => string;

/**
 * A hacking thread algorithm determines how many threads to hack the target with.
 * Basic example: A hardcoded guess.
 * Intermediate example: A more optimal guess based on RAM available on the network.
 * Advanced example: Probabilistic calculations based on hacking chance, also accounting for exp growth.
 */
type HackingThreadAlgo = (ns: NS, network: Network, target: string) => number;

/**
 * A cycle time algorithm determines the time period operations can sync to.
 * Basic example: Weaken time, maybe plus one second.
 * Intermediate example: Round up to multiples of 10 seconds to incorporate sharing.
 * Advanced example: Something to account for darknet something?
 */
type CycleTimeAlgo = (ns: NS, network: Network, target: string) => Farm;

/**
 * A single hack, grow, weaken or share remote, run on a single server, with a specified number of threads, targetting a specific server.
 */
interface Operation {
  /** The host that the operation runs on. */
  host: string;
  /** The number of threads running the action. */
  threads: number;
  /** The type of operation being run. */
  action: Action;
}

/**
 * A collection of Operations that are executed "at the same time."
 */
type Batch = Operation[];

/**
 * Represents a currently running batch.
 * Startup promises resolve when HGW scripts are execed.
 * Completion promises resolve when those scripts complete.
 */
class Farm {
  /** Promises that resolve once remote scripts finish launching. */
  startupPromises: Promise<void>[];
  /** Promises that resolve once remote scripts finish running. */
  completionPromises: Promise<true | void>[];
  /** The miliseconds that the batch operations are synched to. */
  cycleTime: number;
  /** A port number used for tracking completion of farm operations. */
  port: number;
  /** A hard limit on the number of scripts launched by this, for the sake of stability. */
  scriptLimit: number;

  constructor(cycleTime: number) {
    this.startupPromises = [];
    this.completionPromises = [];
    this.cycleTime = cycleTime;
    this.port = STARTING_PORT;
    this.scriptLimit = SCRIPT_LIMIT;
  }

  exec(ns: NS, network: Network, target: string, batch: Batch): boolean {
    if (this.scriptLimit < batch.length) {
      return false;
    } else {
      this.scriptLimit = this.scriptLimit - batch.length;
      this.startupPromises.push(
        new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            try {
              for (const operation of batch) {
                let additionalMsecs = -1;
                let ramOverride = -1;
                // Want to buy rust match expression...
                if (operation.action === Action.hack) {
                  // Extra half a millisecond fixes a silly rounding error
                  additionalMsecs =
                    this.cycleTime - ns.getHackTime(target) + 0.5;
                  ramOverride = ActionRam.hack;
                } else if (operation.action === Action.grow) {
                  // Extra half a millisecond fixes a silly rounding error
                  additionalMsecs =
                    this.cycleTime - ns.getGrowTime(target) + 0.5;
                  ramOverride = ActionRam.grow;
                } else if (operation.action === Action.weaken) {
                  // Extra half a millisecond fixes a silly rounding error
                  additionalMsecs =
                    this.cycleTime - ns.getWeakenTime(target) + 0.5;
                  ramOverride = ActionRam.weaken;
                } else if (operation.action === Action.share) {
                  // For share additionalMsecs is instead the number of times to loop the share
                  additionalMsecs = Math.floor(this.cycleTime / 10000);
                  ramOverride = ActionRam.share;
                } else {
                  reject(new Error("typescript says this is unreachable"));
                }

                // Sanity check, additionalMsecs must be positive!
                if (additionalMsecs < 0) {
                  reject(
                    new Error(
                      `Negative extraMsecs with cycle time ${this.cycleTime} and weaken time ${ns.getWeakenTime(target)} for target ${target}`,
                    ),
                  );
                }

                const runOptions: Required<RunOptions> = {
                  preventDuplicates: false,
                  ramOverride: ramOverride,
                  temporary: true,
                  threads: operation.threads,
                };

                const actionOptions: Required<BasicHGWOptions> = {
                  additionalMsec: additionalMsecs,
                  stock: false,
                  threads: operation.threads,
                };
                const execResult = ns.exec(
                  ns.getScriptName(),
                  operation.host,
                  runOptions,
                  operation.action,
                  target,
                  actionOptions.additionalMsec,
                  actionOptions.stock,
                  actionOptions.threads,
                  this.port,
                );

                // Sanity check, exec was successful.
                if (execResult === 0) {
                  reject(
                    new Error(
                      `Failed to exec ${operation.action} on ${operation.host} with ${operation.threads} threads\n` +
                        `${JSON.stringify(ns.getServer(operation.host))}`,
                    ),
                  );
                }
                this.completionPromises.push(
                  ns.getPortHandle(this.port).nextWrite(),
                );
                this.port = this.port + 1;
              }
            } catch (error) {
              // This pattern is valid, eslint is being annoying.
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              reject(error);
            }
            resolve();
          });
        }),
      );
      return true;
    }
  }
}

/**
 * A batcher task actually runs scripts.
 * It returns the number of scripts launched.
 * For example HWGW to farm money.
 * The network will be modified reducing RAM available on servers.
 * The farm will also be modified. Port will be increased, script limit will be decreased and promises will be pushed.
 */
type BatcherTask = (
  ns: NS,
  network: Network,
  target: string,
  hackThreads: number,
  farm: Farm,
) => number;

/**
 * Simply will run the operation.
 */
async function remotesMode(ns: NS) {
  if (ns.args[0] === "hack") {
    await ns.hack(ns.args[1] as string, {
      additionalMsec: ns.args[2] as number,
      stock: ns.args[3] as boolean,
      threads: ns.args[4] as number,
    });
  } else if (ns.args[0] === "grow") {
    await ns.grow(ns.args[1] as string, {
      additionalMsec: ns.args[2] as number,
      stock: ns.args[3] as boolean,
      threads: ns.args[4] as number,
    });
  } else if (ns.args[0] === "weaken") {
    await ns.weaken(ns.args[1] as string, {
      additionalMsec: ns.args[2] as number,
      stock: ns.args[3] as boolean,
      threads: ns.args[4] as number,
    });
  } else if (ns.args[0] === "share") {
    for (let n = 0; n < (ns.args[2] as number); n++) {
      await ns.share();
    }
  } else {
    throw Error(
      "Invalid remotes mode action, valid actions are hack, grow, weaken and share",
    );
  }

  ns.writePort(ns.args[5] as number, 1);
  ns.clearPort(ns.args[5] as number);
}

/**
 * Actually runs the BatcherAlgo type.
 */
async function runBatcherAlgo(ns: NS, algo: BatcherAlgo) {
  const network = algo.buildNetwork(ns);

  // Is this needed so purchased servers "appear" ???
  await ns.asleep(0);

  const target = algo.selectTarget(ns, network);
  const hackThreads = algo.pickHackThreads(ns, network, target);
  ns.tprint(
    `Batcher target is: ${target} with hack percentage ${ns.format.percent(ns.hackAnalyze(target) * hackThreads)}`,
  );
  const farm = algo.pickCycleTime(ns, network, target);
  ns.tprint(
    `Batch will take approximately ${ns.format.time(farm.cycleTime, false)}`,
  );

  for (const task of algo.tasks) {
    const scriptsLaunched = task(ns, network, target, hackThreads, farm);
    ns.tprint(
      `Executed task ${task.name} launching ${scriptsLaunched} scripts`,
    );
  }
  const batchStartTime = performance.now();
  const batchStartMoney = ns.getServerMoneyAvailable("home");
  await Promise.all(farm.startupPromises);
  const scriptLaunchTime = performance.now();
  ns.tprint(
    `Scripts launched in ${ns.format.time(scriptLaunchTime - batchStartTime, true)}`,
  );

  await Promise.all(farm.completionPromises);
  const batchFinishTime = performance.now();
  const batchFinishMoney = ns.getServerMoneyAvailable("home");
  ns.tprint(
    `Batch finished in ${ns.format.time(batchFinishTime - scriptLaunchTime, true)}`,
  );
  ns.tprint(
    `Target ${target} security ${ns.getServerSecurityLevel(target)} / ${ns.getServerMinSecurityLevel(target)}, ` +
      `money $${ns.format.number(ns.getServerMoneyAvailable(target))} / $${ns.format.number(ns.getServerMaxMoney(target))}`,
  );
  ns.tprint(
    `$${ns.format.number(batchFinishMoney - batchStartMoney)} money hacked`,
  );
}

/**
 * Return a list of all clearnet servers.
 */
function getServerList(ns: NS): Set<string> {
  /**
   * Populate the network without changing it.
   */
  const unscannedServers: string[] = ["home"];
  const result = new Set<string>();
  while (unscannedServers.length > 0) {
    const serverToScan: string = unscannedServers.pop()!;
    result.add(serverToScan);
    for (const server of ns.scan(serverToScan)) {
      if (!result.has(server)) {
        unscannedServers.push(server);
      }
    }
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

/**
 * This limited mode of the batcher is designed just for initial bootstrapping, and is very RAM constrained.
 */
async function limitedMode(ns: NS) {
  ns.disableLog("ALL");
  ns.tprint(
    "Batcher running in limited mode. Upgrade your home RAM to 32GB or higher to unlock full functionality.",
  );
  await runBatcherAlgo(ns, {
    buildNetwork: povertyPwnNetwork,
    selectTarget: targetN00dles,
    pickHackThreads: hardcodedHackThreads,
    pickCycleTime: weakenTimeRoundedUp,
    tasks: [
      basicHGW,
      basicWeakenToMinSecurity,
      basicGrowToMaxMoney,
      fullWeaken,
    ],
  });
}

/**
 * The main batcher!
 */
async function mainMode(ns: NS) {
  ns.disableLog("ALL");
  while (true) {
    await runBatcherAlgo(ns, {
      buildNetwork: pwnAndPurchase,
      selectTarget: wildGuess,
      pickHackThreads: hardcodedHackThreads,
      pickCycleTime: weakenTimeRoundedUp,
      tasks: [
        basicHWGW,
        basicWeakenToMinSecurity,
        basicGrowToMaxMoney,
        shareExtra,
        fullWeaken,
      ],
    });
  }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

/**
 * Populate the network without changing it.
 */
function initNetwork(ns: NS): Network {
  const result: Network = new Map();
  for (const server of getServerList(ns)) {
    result.set(server, ns.getServer(server) as Required<Server>);
    if (server !== "home") {
      ns.scp(ns.getScriptName(), server);
    }
  }
  return result;
}

/**
 * Populate the network without changing it, avoid ns.getServer to save on RAM.
 */
function povertyInitNetwork(ns: NS): Network {
  const result: Network = new Map();
  for (const server of getServerList(ns)) {
    const newServer: Required<Server> = {
      hostname: server,
      ip: "povrty",
      sshPortOpen: false,
      ftpPortOpen: false,
      smtpPortOpen: false,
      httpPortOpen: false,
      sqlPortOpen: false,
      hasAdminRights: ns.hasRootAccess(server),
      cpuCores: 1,
      isConnectedTo: false,
      ramUsed: ns.getServerUsedRam(server),
      maxRam: ns.getServerMaxRam(server),
      organizationName: "poverty",
      purchasedByPlayer: false,
      backdoorInstalled: false,
      baseDifficulty: ns.getServerMinSecurityLevel(server),
      hackDifficulty: ns.getServerSecurityLevel(server),
      minDifficulty: ns.getServerMinSecurityLevel(server),
      moneyAvailable: ns.getServerMoneyAvailable(server),
      moneyMax: ns.getServerMaxMoney(server),
      numOpenPortsRequired: 5,
      openPortCount: 0,
      requiredHackingSkill: 9999,
      serverGrowth: 0.67,
    };
    result.set(server, newServer);
    if (server !== "home") {
      ns.scp(ns.getScriptName(), server);
    }
  }
  return result;
}

/**
 * Populate the network, but also attempt to get root on boxes.
 * Avoid calling ns.getServer to save on RAM.
 */
function povertyPwnNetwork(ns: NS): Network {
  const result: Network = povertyInitNetwork(ns);
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
 * Populate the network, attempt to get root on boxes, and also purchase cloud servers.
 */
function pwnAndPurchase(ns: NS): Network {
  const result: Network = pwnNetwork(ns);
  managePurchasedServers(ns, result);
  return result;
}

function managePurchasedServers(ns: NS, network: Network): void {
  let upgradableServer: string | null = null;
  let purchasedServerCount = 0;
  for (const [server, data] of network) {
    if (data.purchasedByPlayer && server !== "home") {
      purchasedServerCount++;
      if (data.maxRam < ns.cloud.getRamLimit()) {
        upgradableServer = server;
      }
    }
  }

  if (upgradableServer !== null) {
    upgradeServer(ns, upgradableServer);
    network.get(upgradableServer)!.maxRam =
      ns.getServerMaxRam(upgradableServer);
  } else if (purchasedServerCount < ns.cloud.getServerLimit()) {
    do {
      const newServer = purchaseServer(ns, purchasedServerCount);
      if (newServer !== "") {
        network.set(newServer, ns.getServer(newServer) as Required<Server>);
        purchasedServerCount++;
        ns.scp(ns.getScriptName(), newServer);
      }
    } while (
      ns.getServerMoneyAvailable("home") >
        ns.cloud.getServerCost(ns.cloud.getRamLimit()) &&
      purchasedServerCount < ns.cloud.getServerLimit()
    );
  }
  return;
}

function upgradeServer(ns: NS, server: string) {
  let ram = ns.cloud.getRamLimit();
  const currentRam = ns.getServerMaxRam(server);
  while (ram > currentRam) {
    if (ns.cloud.upgradeServer(server, ram)) {
      ns.tprint(
        `Upgraded ${server} from ${ns.format.ram(currentRam)} RAM to ${ns.format.ram(ram)} RAM`,
      );
      return;
    } else {
      ram /= 2;
    }
  }

  const upgradeCost = ns.cloud.getServerUpgradeCost(server, currentRam * 2);
  ns.tprint(
    `Need $${ns.format.number(upgradeCost)} to upgrade cloud server ${server}`,
  );
  return;
}

function purchaseServer(ns: NS, purchasedServerCount: number): string {
  const name = `purchased-${String(purchasedServerCount).padStart(2, "0")}`;
  let ram = ns.cloud.getRamLimit();
  let result = "";
  while (ram >= 2) {
    result = ns.cloud.purchaseServer(name, ram);
    if (result !== "") {
      ns.tprint(
        `Purchased cloud server ${result} with ${ns.format.ram(ram)} of RAM`,
      );
      break;
    } else {
      ram /= 2;
    }
  }
  return result;
}

/**
 * Hardcodes n00dles as a target.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function targetN00dles(ns: NS, network: Network): string {
  return "n00dles";
}

/**
 * Wild guessing about hacking targets not using formulas.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function wildGuess(ns: NS, network: Network): string {
  if (ns.getHackingLevel() < 100) {
    return "n00dles";
  } else if (ns.getHackingLevel() < 400) {
    return "joesguns";
  } else if (
    ns.hasRootAccess("phantasy") &&
    ns.cloud.getServerLimit() !== ns.cloud.getServerNames().length
  ) {
    return "phantasy";
  } else if (ns.hasRootAccess("omega-net")) {
    return "omega-net";
  } else {
    return "joesguns";
  }
}

/**
 * Hardcodes 5 hacking threads. But doesn't hack if the target isn't weakened to min security.
 */
function hardcodedHackThreads(
  ns: NS, // eslint-disable-line @typescript-eslint/no-unused-vars
  network: Network, // eslint-disable-line @typescript-eslint/no-unused-vars
  target: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): number {
  return 9;
}

/**
 * A cycle time that is the wekaen time rounded up to the nearest second.
 */
function weakenTimeRoundedUp(ns: NS, network: Network, target: string): Farm {
  const weakenTime = ns.getWeakenTime(target);
  const cycleTime = Math.ceil(weakenTime / 1000) * 1000;
  return new Farm(cycleTime);
}

/**
 * Crude HWGW batching to extract money from the target.
 */
function basicHWGW(
  ns: NS,
  network: Network,
  target: string,
  hackThreads: number,
  farm: Farm,
): number {
  let result = 0;

  // Only run this if target is prepped.
  if (
    ns.getServerMinSecurityLevel(target) !==
      ns.getServerSecurityLevel(target) ||
    ns.getServerMaxMoney(target) !== ns.getServerMoneyAvailable(target)
  ) {
    return result;
  }

  const amountHacked = ns.hackAnalyze(target) * hackThreads;
  // Amount to grow over. Needed due to exp gain, and since this is a basic algorithm that doesn't use formulas.
  const overGrowth = 1.1;
  const growthRequired = (1 / (1 - amountHacked)) * overGrowth;
  const growThreads = Math.ceil(ns.growthAnalyze(target, growthRequired));
  const firstWeakenThreads = Math.ceil((hackThreads * HG_SEC) / WEAKEN_SEC);
  const secondWeakenThreads = Math.ceil((growThreads * HG_SEC) / WEAKEN_SEC);

  while (farm.scriptLimit > 100) {
    let hackHost = "invalid";
    let firstWeakenHost = "invalid";
    let growHost = "invalid";
    let secondWeakenHost = "invalid";

    for (const [serverName, serverData] of network) {
      if (serverData.hasAdminRights) {
        let serverRam = serverData.maxRam - serverData.ramUsed;

        if (
          hackHost === "invalid" &&
          Math.floor(serverRam / ActionRam.hack) >= hackThreads
        ) {
          hackHost = serverName;
          serverRam = serverRam - ActionRam.hack * hackThreads;
        }
        if (
          firstWeakenHost === "invalid" &&
          Math.floor(serverRam / ActionRam.weaken) >= firstWeakenThreads
        ) {
          firstWeakenHost = serverName;
          serverRam = serverRam - ActionRam.weaken * firstWeakenThreads;
        }
        if (
          growHost === "invalid" &&
          Math.floor(serverRam / ActionRam.grow) >= growThreads
        ) {
          growHost = serverName;
          serverRam = serverRam - ActionRam.grow * growThreads;
        }
        if (
          secondWeakenHost === "invalid" &&
          Math.floor(serverRam / ActionRam.weaken) >= secondWeakenThreads
        ) {
          secondWeakenHost = serverName;
        }
      }
    }
    if (
      hackHost === "invalid" ||
      firstWeakenHost === "invalid" ||
      growHost === "invalid" ||
      secondWeakenHost === "invalid"
    ) {
      return result;
    } else {
      const batch: Batch = [
        {
          host: hackHost,
          threads: hackThreads,
          action: Action.hack,
        },
        {
          host: firstWeakenHost,
          threads: firstWeakenThreads,
          action: Action.weaken,
        },
        {
          host: growHost,
          threads: growThreads,
          action: Action.grow,
        },
        {
          host: secondWeakenHost,
          threads: secondWeakenThreads,
          action: Action.weaken,
        },
      ];
      if (farm.exec(ns, network, target, batch)) {
        result = result + batch.length;
      } else {
        return result;
      }
      const hackHostServer = network.get(hackHost)!;
      hackHostServer.ramUsed =
        hackHostServer.ramUsed + ActionRam.hack * hackThreads;
      const firstWeakenHostServer = network.get(firstWeakenHost)!;
      firstWeakenHostServer.ramUsed =
        firstWeakenHostServer.ramUsed + ActionRam.weaken * firstWeakenThreads;
      const growHostServer = network.get(growHost)!;
      growHostServer.ramUsed =
        growHostServer.ramUsed + ActionRam.grow * growThreads;
      const secondWeakenHostServer = network.get(secondWeakenHost)!;
      secondWeakenHostServer.ramUsed =
        secondWeakenHostServer.ramUsed + ActionRam.weaken * secondWeakenThreads;
    }
  }
  return result;
}

/**
 * Crude HGW batching to extract money from the target.
 * Note outside of n00dles this won't work because it won't grow enough.
 */
function basicHGW(
  ns: NS,
  network: Network,
  target: string,
  hackThreads: number,
  farm: Farm,
): number {
  let result = 0;

  // Only run this if target is prepped.
  if (
    ns.getServerMinSecurityLevel(target) !==
      ns.getServerSecurityLevel(target) ||
    ns.getServerMaxMoney(target) !== ns.getServerMoneyAvailable(target)
  ) {
    return result;
  }

  const amountHacked = ns.hackAnalyze(target) * hackThreads;
  const growthRequired = 1 / (1 - amountHacked);
  const growThreads = Math.ceil(ns.growthAnalyze(target, growthRequired));
  const weakenThreads = Math.ceil(
    ((hackThreads + growThreads) * HG_SEC) / WEAKEN_SEC,
  );

  while (true) {
    let hackHost = "invalid";
    let weakenHost = "invalid";
    let growHost = "invalid";

    for (const [serverName, serverData] of network) {
      if (serverData.hasAdminRights) {
        let serverRam = serverData.maxRam - serverData.ramUsed;

        if (
          hackHost === "invalid" &&
          Math.floor(serverRam / ActionRam.hack) >= hackThreads
        ) {
          hackHost = serverName;
          serverRam = serverRam - ActionRam.hack * hackThreads;
        }
        if (
          growHost === "invalid" &&
          Math.floor(serverRam / ActionRam.grow) >= growThreads
        ) {
          growHost = serverName;
          serverRam = serverRam - ActionRam.hack * growThreads;
        }
        if (
          weakenHost === "invalid" &&
          Math.floor(serverRam / ActionRam.weaken) >= weakenThreads
        ) {
          weakenHost = serverName;
        }
      }
    }
    if (
      hackHost === "invalid" ||
      growHost === "invalid" ||
      weakenHost === "invalid"
    ) {
      return result;
    } else {
      const batch: Batch = [
        {
          host: hackHost,
          threads: hackThreads,
          action: Action.hack,
        },
        {
          host: growHost,
          threads: growThreads,
          action: Action.grow,
        },
        {
          host: weakenHost,
          threads: weakenThreads,
          action: Action.weaken,
        },
      ];
      if (farm.exec(ns, network, target, batch)) {
        result = result + batch.length;
      } else {
        return result;
      }
      const hackHostServer = network.get(hackHost)!;
      hackHostServer.ramUsed =
        hackHostServer.ramUsed + ActionRam.hack * hackThreads;
      const growHostServer = network.get(growHost)!;
      growHostServer.ramUsed =
        growHostServer.ramUsed + ActionRam.grow * growThreads;
      const weakenHostServer = network.get(weakenHost)!;
      weakenHostServer.ramUsed =
        weakenHostServer.ramUsed + ActionRam.weaken * weakenThreads;
    }
  }
}

/**
 * Consumes all remaining RAM to weaken the target.
 */
function fullWeaken(
  ns: NS,
  network: Network,
  target: string,
  hackThreads: number,
  farm: Farm,
): number {
  let result = 0;
  for (const [serverName, serverData] of network) {
    const serverRam = serverData.maxRam - serverData.ramUsed;
    const weakenThreads = Math.floor(serverRam / ActionRam.weaken);
    if (serverData.hasAdminRights && weakenThreads > 0) {
      const weakenBatch: Batch = [
        {
          host: serverName,
          threads: weakenThreads,
          action: Action.weaken,
        },
      ];
      if (farm.exec(ns, network, target, weakenBatch)) {
        result = result + weakenBatch.length;
      } else {
        return result;
      }
      serverData.ramUsed =
        serverData.ramUsed + weakenThreads * ActionRam.weaken;
    }
  }
  return result;
}

/**
 * Shares extra ram
 */
function shareExtra(
  ns: NS,
  network: Network,
  target: string,
  hackThreads: number,
  farm: Farm,
): number {
  let result = 0;
  for (const [serverName, serverData] of network) {
    const serverRam = serverData.maxRam - serverData.ramUsed;
    const shareThreads = Math.floor(serverRam / ActionRam.share);
    if (serverData.hasAdminRights && shareThreads > 0) {
      const batch: Batch = [
        {
          host: serverName,
          threads: shareThreads,
          action: Action.share,
        },
      ];
      if (farm.exec(ns, network, target, batch)) {
        result = result + batch.length;
      } else {
        return result;
      }
      serverData.ramUsed = serverData.ramUsed + shareThreads * ActionRam.share;
    }
  }
  return result;
}

/**
 * Crudely weakens the target to minimum security.
 */
function basicWeakenToMinSecurity(
  ns: NS,
  network: Network,
  target: string,
  hackThreads: number,
  farm: Farm,
): number {
  let result = 0;

  if (
    ns.getServerSecurityLevel(target) === ns.getServerMinSecurityLevel(target)
  ) {
    return result;
  }

  const weakeningRequired =
    ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
  let weakenThreadsRequired = Math.ceil(weakeningRequired / WEAKEN_SEC);

  for (const [serverName, serverData] of network) {
    const serverRam = serverData.maxRam - serverData.ramUsed;
    const weakenThreads = Math.floor(serverRam / ActionRam.weaken);
    if (serverData.hasAdminRights && weakenThreads > 0) {
      if (weakenThreadsRequired <= 0) {
        return result;
      } else {
        const weakenBatch: Batch = [
          {
            host: serverName,
            threads: Math.min(weakenThreadsRequired, weakenThreads),
            action: Action.weaken,
          },
        ];
        if (farm.exec(ns, network, target, weakenBatch)) {
          result = result + weakenBatch.length;
        } else {
          return result;
        }
        serverData.ramUsed =
          serverData.ramUsed + weakenThreads * ActionRam.weaken;
        weakenThreadsRequired = weakenThreadsRequired - weakenThreads;
      }
    }
  }
  return result;
}

/**
 * Crudely pairs grows and weakens to try and grow the target to max money.
 */
function basicGrowToMaxMoney(
  ns: NS,
  network: Network,
  target: string,
  hackThreads: number,
  farm: Farm,
): number {
  let result = 0;

  if (ns.getServerMoneyAvailable(target) === ns.getServerMaxMoney(target)) {
    return 0;
  }

  let growThreads = 25;
  while (growThreads > 0 && farm.scriptLimit > 100) {
    let weakenThreads = 2;
    if (growThreads <= 12) {
      weakenThreads = 1;
    }
    const growRam = growThreads * ActionRam.grow;
    const weakenRam = weakenThreads * ActionRam.weaken;

    let growHost = "invalid";
    let weakenHost = "invalid";
    for (const [serverName, serverData] of network) {
      const serverRam = serverData.maxRam - serverData.ramUsed;
      if (serverData.hasAdminRights && serverRam >= growRam) {
        growHost = serverName;
        serverData.ramUsed = serverData.ramUsed + growRam;
        break;
      }
    }
    if (growHost === "invalid") {
      growThreads = growThreads - 1;
      continue;
    } else {
      for (const [serverName, serverData] of network) {
        const serverRam = serverData.maxRam - serverData.ramUsed;
        if (serverData.hasAdminRights && serverRam >= weakenRam) {
          weakenHost = serverName;
          serverData.ramUsed = serverData.ramUsed + weakenRam;
          break;
        }
      }
      if (weakenHost === "invalid") {
        return result;
      } else {
        const growWeakenBatch: Batch = [
          {
            host: growHost,
            threads: growThreads,
            action: Action.grow,
          },
          {
            host: weakenHost,
            threads: weakenThreads,
            action: Action.weaken,
          },
        ];
        if (farm.exec(ns, network, target, growWeakenBatch)) {
          result = result + growWeakenBatch.length;
        } else {
          return result;
        }
      }
    }
  }
  return result;
}
