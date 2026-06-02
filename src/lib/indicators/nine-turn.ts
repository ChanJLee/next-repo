// TD Sequential —— 完整版「神奇九转」，输出罕见的 Countdown 13 反转信号。
//
// 两段式：
//  1) Setup（九转）：收盘价相对 lookback（默认 4）根之前连续走低/走高，
//     带价格翻转门槛，数到 9 算 Setup 完成——这是 Countdown 的启动条件，本身不展示。
//  2) Countdown（数到 13）：Setup 完成后开始计数，【无需连续】：
//     · 买入 Countdown：收盘价 <= 两根之前的最低价，计一次；累计到 13 → 潜在底部反转。
//     · 卖出 Countdown：收盘价 >= 两根之前的最高价，计一次；累计到 13 → 潜在顶部反转。
//  取消/切换：出现反方向 Setup 完成会取消当前 Countdown 并切换方向；同方向再次
//  Setup 完成不重启进行中的 Countdown；数到 13 即结束，需新 Setup 才再起一段。
//
// 13 信号比 9 罕见得多（往往数月乃至更久才出一次），适合作为强反转提示。

export interface TDCandle {
  high: number;
  low: number;
  close: number;
}

export interface TDSequentialResult {
  /** 买入 Setup 计数 0..9（内部用，一般不展示） */
  buySetup: number[];
  /** 卖出 Setup 计数 0..9 */
  sellSetup: number[];
  /** 买入 Countdown 进度 0..13 */
  buyCountdown: number[];
  /** 卖出 Countdown 进度 0..13 */
  sellCountdown: number[];
  /** 该根买入 Countdown 完成（=13），潜在底部反转 */
  buy13: boolean[];
  /** 该根卖出 Countdown 完成（=13），潜在顶部反转 */
  sell13: boolean[];
}

export function computeTDSequential(candles: TDCandle[], lookback = 4): TDSequentialResult {
  const n = candles.length;
  const buySetup = new Array<number>(n).fill(0);
  const sellSetup = new Array<number>(n).fill(0);
  const buyCountdown = new Array<number>(n).fill(0);
  const sellCountdown = new Array<number>(n).fill(0);
  const buy13 = new Array<boolean>(n).fill(false);
  const sell13 = new Array<boolean>(n).fill(false);

  // 方向：-1 低于 lookback 根前 / +1 高于 / 0 持平或不可比
  const dir = new Array<number>(n).fill(0);
  for (let i = lookback; i < n; i++) {
    const c = candles[i].close;
    const ref = candles[i - lookback].close;
    dir[i] = c < ref ? -1 : c > ref ? 1 : 0;
  }

  let bc = 0; // 买入 Setup 计数
  let sc = 0; // 卖出 Setup 计数
  let phase: "none" | "buy" | "sell" = "none";
  let cd = 0; // 当前 Countdown 进度

  for (let i = lookback; i < n; i++) {
    // ---- Setup（带价格翻转门槛，满 9 不自动重启）----
    if (dir[i] === -1) {
      if (bc > 0 && bc < 9) bc += 1;
      else if (bc === 0 && dir[i - 1] === 1) bc = 1;
      else bc = 0;
    } else {
      bc = 0;
    }
    if (dir[i] === 1) {
      if (sc > 0 && sc < 9) sc += 1;
      else if (sc === 0 && dir[i - 1] === -1) sc = 1;
      else sc = 0;
    } else {
      sc = 0;
    }
    buySetup[i] = bc;
    sellSetup[i] = sc;

    // ---- Setup 完成 → 启动 / 切换 Countdown ----
    if (bc === 9 && phase !== "buy") {
      phase = "buy";
      cd = 0;
    } else if (sc === 9 && phase !== "sell") {
      phase = "sell";
      cd = 0;
    }

    // ---- Countdown 计数（无需连续）----
    if (phase === "buy") {
      if (candles[i].close <= candles[i - 2].low) {
        cd += 1;
        if (cd >= 13) {
          buy13[i] = true;
          phase = "none";
          cd = 0;
        }
      }
      buyCountdown[i] = cd;
    } else if (phase === "sell") {
      if (candles[i].close >= candles[i - 2].high) {
        cd += 1;
        if (cd >= 13) {
          sell13[i] = true;
          phase = "none";
          cd = 0;
        }
      }
      sellCountdown[i] = cd;
    }
  }

  return { buySetup, sellSetup, buyCountdown, sellCountdown, buy13, sell13 };
}
