import chalk from "chalk";

export const blue = (text: string) => chalk.blue(text);
export const red = (text: string) => chalk.red(text);
export const green = (text: string) => chalk.green(text);
export const yellow = (text: string) => chalk.yellow(text);
export const dim = (text: string) => chalk.dim(text);

export function whiteBold(text: string) {
  return chalk.white.bold(text);
}

export function notifySuccess(message: string) {
  console.log(`${chalk.green.bold("✓")} ${message}`);
}

export function notifyFail(message: string) {
  console.error(`${chalk.red.bold("✗")} ${message}`);
}
