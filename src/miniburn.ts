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
  } else if (ns.ramOverride() < 32) {
    await limitedMode(ns);
  } else {
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
  // The fourth step in a basic batcher is to pick the shape of the batch to run.
  pickBatchShape: BatchShapeAlgo;
  // The fifth step in a basic batcher is to execute batches of that shape on the network.
  execBatch: BatchExecAlgo;
  // The sixth step in a basic batcher is to utilize the RAM that's still available after execing the batches.
  useRemainder: RemainderAlgo;
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
 * A single hack, grow, weaken or share remote, run on a single server, with a specified number of threads, targetting a specific server.
 */
interface Operation {
  target: string;
  host: string;
  threads: number;
  action: Action;
}

/**
 * A collection of Operations that are executed "at the same time."
 */
type Batch = Operation[];

/**
 * A batch shape algorithm determines what variety of batch to run against the target.
 * Basic example: HWGW.
 * Advanced example: I am unsure.
 */
type BatchShapeAlgo = (
  ns: NS,
  network: Network,
  target: string,
  hackingThreads: number,
) => { cycleTime: number; batch: Batch };

/**
 * Promises that resolve when remote scripts start up, and complete.
 */
interface ExecPromises {
  /** Promises that resolve once remote scripts finish launching. */
  startupPromises: Promise<void>[];
  /** Promises that resolve once remote scripts finish running. */
  completionPromises: Promise<true | void>[];
}

/**
 * A batch exec algorithm will run the batch on the network multiple times.
 * Basic example: First fit found.
 * Intermediate example: Will prefer to run smaller operations on servers with less RAM available.
 * Advanced example: I am unsure.
 */
type BatchExecAlgo = (
  ns: NS,
  network: Network,
  target: string,
  cycleTime: number,
  batch: Batch,
) => ExecPromises;

/**
 * A remainder algorithm will determine what to do with the extra available RAM after running all the batches.
 * Basic example: Use it for weaken, to gain extra exp.
 * Intermediate example: Use it for share, if weaken wouldn't gain worthwhile exp.
 * Advanced example: Preemptively weaken what the next target is likely to be.
 */
type RemainderAlgo = (
  ns: NS,
  network: Network,
  target: string,
  cycleTime: number,
) => ExecPromises;

/**
 * Simply will run the operation.
 */
async function remotesMode(ns: NS) {
  // TODO
  ns.print("Running in remotes mode???");
  await ns.asleep(5000);
}

/**
 * This limited mode of the batcher is designed just for initial bootstrapping, and is very RAM constrained.
 */
async function limitedMode(ns: NS) {
  ns.disableLog("ALL");
  ns.tprint(
    "Batcher running in limited mode. Upgrade your home RAM to 32GB or higher to unlock full functionality.",
  );
  await runBatcherAlgo(ns, {
    buildNetwork: pwnNetwork,
    selectTarget: targetN00dles,
    pickHackThreads: fiveHackThreads,
    pickBatchShape: basicHWGW,
    execBatch: basicExec,
    useRemainder: remainderWeaken,
  });
}

/**
 * The main batcher!
 */
async function mainMode(ns: NS) {
  ns.disableLog("ALL");
  ns.tprint("WOW RAM!!! TODO");
  await ns.asleep(5000);
  // TODO
}

async function runBatcherAlgo(ns: NS, algo: BatcherAlgo) {
  const network = algo.buildNetwork(ns);

  const target = algo.selectTarget(ns, network);
  ns.tprint(`Batcher target is: ${target}`);

  const hackThreads = algo.pickHackThreads(ns, network, target);
  ns.tprint(`Hacking ${target} with ${hackThreads} threads per batch`);

  const { cycleTime, batch } = algo.pickBatchShape(
    ns,
    network,
    target,
    hackThreads,
  );

  const batchExecPromises = algo.execBatch(
    ns,
    network,
    target,
    cycleTime,
    batch,
  );
  const remainderExecPromises = algo.useRemainder(
    ns,
    network,
    target,
    cycleTime,
  );

  const execPromises: ExecPromises = {
    startupPromises: batchExecPromises.startupPromises.concat(
      remainderExecPromises.startupPromises,
    ),
    completionPromises: batchExecPromises.completionPromises.concat(
      remainderExecPromises.completionPromises,
    ),
  };

  ns.tprint(`Launching ${execPromises.startupPromises.length} scripts`);
  const batchStartTime = performance.now();

  await Promise.all(execPromises.startupPromises);
  const scriptLaunchTime = performance.now();
  ns.tprint(
    `Scripts launched in ${ns.format.time(scriptLaunchTime - batchStartTime, true)}`,
  );

  await Promise.all(execPromises.completionPromises);
  const batchFinishTime = performance.now();
  ns.tprint(
    `Batch finished in ${ns.format.time(scriptLaunchTime - batchFinishTime, true)}`,
  );
}

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

  for (const [serverName] of result) {
    if (serverName !== "home") {
      ns.scp(ns.getScriptName(), serverName);
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
 * Hardcodes n00dles as a target.
 */
function targetN00dles(ns: NS, network: Network): string {
  return "n00dles";
}

/**
 * Hardcodes 5 hacking threads. But doesn't hack if the target isn't weakened to min security.
 */
function fiveHackThreads(ns: NS, network: Network, target: string): number {
  // For a basic algorithm like this we only watn to hack the target if it's at minimum security.
  if (
    network.get(target)?.minDifficulty !== network.get(target)?.hackDifficulty
  ) {
    return 0;
  } else {
    return 5;
  }
}

/**
 * Basic HWGW batch.
 */
function basicHWGW(
  ns: NS,
  network: Network,
  target: string,
  hackingThreads: number,
): { cycleTime: number; batch: Batch } {
  const cycleTime = ns.getWeakenTime(target) + 1000;
  return {
    cycleTime: cycleTime,
    batch: [], // TODO
  };
}

/**
 * Execs a batch on the first servers that will fit it.
 */
function basicExec(
  ns: NS,
  network: Network,
  target: string,
  cycleTime: number,
  batch: Batch,
): ExecPromises {
  return {
    startupPromises: [],
    completionPromises: [],
  };
}

/**
 * Uses remaining ram to run weaken against the target.
 */
function remainderWeaken(
  ns: NS,
  network: Network,
  target: string,
  cycleTime: number,
): ExecPromises {
  const startupPromises: Promise<void>[] = [];
  const completionPromises: Promise<true | void>[] = [];
  let port = 2000;

  for (const [serverName, serverData] of network) {
    if (
      serverData.hasAdminRights &&
      serverData.maxRam - serverData.ramUsed >= ActionRam.weaken
    ) {
      const weakenThreads = Math.floor(
        (serverData.maxRam - serverData.ramUsed) / ActionRam.weaken,
      );

      startupPromises.push(
        new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            const extraMsecs = cycleTime - ns.getWeakenTime(target);
            if (extraMsecs < 0) {
              reject(
                new Error(
                  `Negative extraMsecs with cycle time ${cycleTime} and weaken time ${ns.getWeakenTime(target)} for target ${target}`,
                ),
              );
            }
            const runOptions: Required<RunOptions> = {
              preventDuplicates: false,
              ramOverride: ActionRam.weaken,
              temporary: true,
              threads: weakenThreads,
            };
            const actionOptions: Required<BasicHGWOptions> = {
              additionalMsec: extraMsecs,
              stock: false,
              threads: weakenThreads,
            };
            const execResult = ns.exec(
              ns.getScriptName(),
              serverName,
              runOptions,
              Action.weaken,
              target,
              actionOptions.additionalMsec,
              actionOptions.stock,
              actionOptions.threads,
              port,
            );
            if (execResult === 0) {
              reject(
                new Error(
                  `Failed to exec ${Action.weaken} on ${serverName} with ${weakenThreads} threads`,
                ),
              );
            }
            completionPromises.push(ns.getPortHandle(port).nextWrite());
            port++;
            resolve();
          });
        }),
      );
    }
  }

  return {
    startupPromises: startupPromises,
    completionPromises: completionPromises,
  };
}
