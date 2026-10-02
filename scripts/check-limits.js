const { CodexClient } = require('../src/codex-client');
const client = new CodexClient();
client.readLimits().then((limits) => {
  for (const limit of limits) {
    console.log(limit.name);
    for (const window of limit.windows) console.log(`  ${window.durationMins} 分钟：剩余 ${window.remainingPercent}%`);
  }
  if (!limits.length) console.log('没有可用的额度信息');
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => client.stop());
