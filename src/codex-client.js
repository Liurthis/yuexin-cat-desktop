const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { normalizeLimits } = require('./core');
const { resolveCodexPath } = require('./codex-path');

class CodexClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.proc = null;
    this.buffer = '';
    this.sequence = 0;
    this.pending = new Map();
    this.starting = null;
    this.chatThreadId = null;
    this.activeChat = null;
    this.getCliPath = options.getCliPath || (() => null);
  }

  async start() {
    if (this.starting) return this.starting;
    if (this.proc && !this.proc.killed) return;
    this.starting = this._start();
    try { await this.starting; } finally { this.starting = null; }
  }

  async _start() {
    const cli = resolveCodexPath(this.getCliPath());
    const proc = spawn(cli, ['app-server', '--listen', 'stdio://'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc = proc;
    this.buffer = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => this._receive(chunk));
    proc.stderr.on('data', () => {});
    proc.stdin.on('error', () => {});
    proc.on('error', (error) => { if (this.proc === proc) this._fail(error); });
    proc.on('exit', (code) => { if (this.proc === proc) this._fail(new Error(`Codex 已退出 (${code ?? '未知'})`)); });
    try {
      await this.request('initialize', {
        clientInfo: { name: 'yuexin_desktop_pet', title: '月薪喵桌宠', version: '0.4.0' },
      });
      this._send({ method: 'initialized', params: {} });
    } catch (error) {
      proc.kill();
      throw error;
    }
  }

  _send(message) {
    if (!this.proc || this.proc.killed || !this.proc.stdin.writable) throw new Error('Codex 服务不可用');
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params, timeoutMs = 15000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this._send({ method, id, params: params ?? {} }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  _receive(chunk) {
    this.buffer += chunk;
    for (;;) {
      const end = this.buffer.indexOf('\n');
      if (end < 0) break;
      const line = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.id != null && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message || 'Codex 请求失败'));
        else pending.resolve(message.result);
      } else if (message.method) {
        this.emit('notification', message);
      }
    }
  }

  _fail(error) {
    this.proc = null;
    this.chatThreadId = null;
    if (this.activeChat) {
      clearTimeout(this.activeChat.timer);
      this.activeChat.reject(error);
      this.activeChat = null;
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit('disconnect', error.message);
  }

  async readLimits() {
    await this.start();
    return normalizeLimits(await this.request('account/rateLimits/read'));
  }

  async beginLogin() {
    await this.start();
    const result = await this.request('account/login/start', {
      type: 'chatgpt', useHostedLoginSuccessPage: true, appBrand: 'chatgpt',
    });
    if (!result.authUrl) throw new Error('Codex 未返回登录链接');
    return result.authUrl;
  }

  async chat(text, cwd, onDelta) {
    await this.start();
    if (this.activeChat) throw new Error('月薪喵正在回答上一条消息');
    if (!this.chatThreadId) {
      const result = await this.request('thread/start', {
        model: 'gpt-6-luna', cwd, approvalPolicy: 'never', sandbox: 'read-only',
        serviceName: 'yuexin_desktop_pet',
      }, 30000);
      this.chatThreadId = result.thread.id;
    }
    const threadId = this.chatThreadId;
    const prompt = `你是可爱的月薪喵桌宠。用简短、自然的中文陪用户聊天，通常不超过120字。只需回答，不要运行命令、读取文件、调用工具或修改环境。用户说：${text}`;
    return new Promise(async (resolve, reject) => {
      const chat = { threadId, text: '', resolve, reject, turnId: null, timer: null, onDelta };
      this.activeChat = chat;
      chat.timer = setTimeout(() => {
        if (this.activeChat === chat) {
          this.activeChat = null;
          reject(new Error('回答超时，请稍后重试'));
        }
      }, 90000);
      try {
        const result = await this.request('turn/start', {
          threadId,
          input: [{ type: 'text', text: prompt }],
          approvalPolicy: 'never',
          sandboxPolicy: { type: 'readOnly' },
        }, 30000);
        chat.turnId = result.turn?.id || null;
      } catch (error) {
        clearTimeout(chat.timer);
        this.activeChat = null;
        reject(error);
      }
    });
  }

  handleNotification(message) {
    const chat = this.activeChat;
    if (!chat || message.params?.threadId !== chat.threadId) return;
    if (message.method === 'item/agentMessage/delta') {
      const delta = message.params.delta || '';
      chat.text += delta;
      chat.onDelta?.(chat.text);
    } else if (message.method === 'turn/completed') {
      if (chat.turnId && message.params.turn?.id !== chat.turnId) return;
      clearTimeout(chat.timer);
      this.activeChat = null;
      if (message.params.turn?.status === 'completed') chat.resolve(chat.text || '喵？我这次没想出回答。');
      else chat.reject(new Error('这次回答没有完成，请重试'));
    }
  }

  stop() {
    if (this.proc) this.proc.kill();
    this.proc = null;
  }
}

module.exports = { CodexClient };
