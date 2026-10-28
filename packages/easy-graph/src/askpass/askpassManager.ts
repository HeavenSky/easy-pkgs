/*---------------------------------------------------------------------------------------------
 *  This code is based on the askpass implementation in the Microsoft Visual Studio Code Git Extension
 *  https://github.com/microsoft/vscode/blob/473af338e1bd9ad4d9853933da1cd9d5d9e07dc9/extensions/git/src/askpass.ts,
 *  which has the following copyright notice & license:
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getNonce } from '../utils';
import { Disposable, toDisposable } from '../utils/disposable';

export interface AskpassEnvironment {
	GIT_ASKPASS?: string;
	SSH_ASKPASS: string;
	SSH_ASKPASS_REQUIRE: 'force';
	DISPLAY?: string;
	ELECTRON_RUN_AS_NODE?: string;
	VSCODE_GIT_GRAPH_ASKPASS_NODE?: string;
	VSCODE_GIT_GRAPH_ASKPASS_MAIN?: string;
	VSCODE_GIT_GRAPH_ASKPASS_HANDLE?: string;
}

export type AskpassType = 'https' | 'ssh';

export type AskpassRequest =
	{ askpassType: 'https'; host: string; request: string }
	| { askpassType: 'ssh'; request: string };

const ASKPASS_SCRIPTS = ['askpass.sh', 'ssh-askpass.sh', 'askpass-empty.sh'];
// The extension is bundled into out/extension.js, the askpass scripts and their node entry are built into out/askpass/
const ASKPASS_DIRECTORY = path.join(__dirname, 'askpass');

export class AskpassManager extends Disposable {
	private ipcHandlePath: string;
	private server: http.Server;
	private enabled = true;

	constructor() {
		super();
		this.ipcHandlePath = getIPCHandlePath(getNonce());
		this.server = http.createServer((req, res) => this.onRequest(req, res));
		try {
			this.server.listen(this.ipcHandlePath);
			this.server.on('error', () => this.enabled = false);
		} catch {
			this.enabled = false;
		}
		ASKPASS_SCRIPTS.forEach((script) => {
			try {
				fs.chmodSync(path.join(ASKPASS_DIRECTORY, script), '755');
			} catch { }
		});

		this.registerDisposable(
			// Close the Askpass Server
			toDisposable(() => {
				try {
					this.server.close();
					if (process.platform !== 'win32') {
						fs.unlinkSync(this.ipcHandlePath);
					}
				} catch { }
			})
		);
	}

	private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		let reqData = '';
		req.setEncoding('utf8');
		req.on('data', (d) => reqData += d);
		req.on('end', () => {
			let data: AskpassRequest;
			try {
				data = JSON.parse(reqData) as AskpassRequest;
				if (!isAskpassRequest(data)) throw new Error('Invalid askpass request');
			} catch {
				res.writeHead(400);
				res.end();
				return;
			}

			this.handleRequest(data).then(result => {
				res.writeHead(200);
				res.end(JSON.stringify(result));
			}, () => {
				res.writeHead(500);
				res.end();
			});
		});
	}

	private async handleRequest(data: AskpassRequest): Promise<string> {
		if (data.askpassType === 'ssh') {
			return this.handleSshRequest(data.request);
		}

		const result = await vscode.window.showInputBox({
			placeHolder: data.request,
			prompt: 'Easy Graph: ' + data.host,
			password: /password/i.test(data.request),
			ignoreFocusOut: true
		});
		return result || '';
	}

	private async handleSshRequest(request: string): Promise<string> {
		if (/continue connecting/i.test(request)) {
			const result = await vscode.window.showQuickPick(['yes', 'no'], {
				canPickMany: false,
				ignoreFocusOut: true,
				placeHolder: getHostVerificationPrompt(request)
			});
			return result || '';
		}

		const key = getSshKeyPath(request);
		const result = await vscode.window.showInputBox({
			placeHolder: request.trim(),
			prompt: key !== null ? vscode.l10n.t('Easy Graph: SSH Key {0}', key) : 'Easy Graph: SSH',
			password: /passphrase|password|PIN/i.test(request),
			ignoreFocusOut: true
		});
		return result || '';
	}

	public getEnv(): AskpassEnvironment {
		const env: AskpassEnvironment = this.enabled
			? {
				ELECTRON_RUN_AS_NODE: '1',
				GIT_ASKPASS: path.join(ASKPASS_DIRECTORY, 'askpass.sh'),
				SSH_ASKPASS: path.join(ASKPASS_DIRECTORY, 'ssh-askpass.sh'),
				SSH_ASKPASS_REQUIRE: 'force',
				VSCODE_GIT_GRAPH_ASKPASS_NODE: process.execPath,
				VSCODE_GIT_GRAPH_ASKPASS_MAIN: path.join(ASKPASS_DIRECTORY, 'askpassMain.js'),
				VSCODE_GIT_GRAPH_ASKPASS_HANDLE: this.ipcHandlePath
			}
			: {
				GIT_ASKPASS: path.join(ASKPASS_DIRECTORY, 'askpass-empty.sh'),
				SSH_ASKPASS: path.join(ASKPASS_DIRECTORY, 'askpass-empty.sh'),
				SSH_ASKPASS_REQUIRE: 'force'
			};

		// Respect a GIT_ASKPASS provided by the environment (e.g. Coder, Codespaces), unless it is one of Git Graph's own scripts.
		if (hasExternalGitAskpass()) {
			delete env.GIT_ASKPASS;
		}

		// OpenSSH < 8.4 ignores SSH_ASKPASS_REQUIRE, and only uses SSH_ASKPASS when DISPLAY is set.
		if (process.platform !== 'win32' && !process.env['DISPLAY']) {
			env.DISPLAY = ':0';
		}

		return env;
	}
}

function hasExternalGitAskpass(): boolean {
	const gitAskpass = process.env['GIT_ASKPASS'];
	if (typeof gitAskpass !== 'string' || gitAskpass.trim() === '') return false;
	const ownScripts = ASKPASS_SCRIPTS.map((script) => path.resolve(ASKPASS_DIRECTORY, script));
	return ownScripts.indexOf(path.resolve(gitAskpass)) === -1;
}

function isAskpassRequest(data: unknown): data is AskpassRequest {
	if (data === null || typeof data !== 'object') return false;
	const request = data as { askpassType?: unknown; host?: unknown; request?: unknown };
	return (request.askpassType === 'https' || request.askpassType === 'ssh')
		&& typeof request.request === 'string'
		&& (request.askpassType === 'ssh' || typeof request.host === 'string');
}

function getSshKeyPath(request: string): string | null {
	const match = /passphrase for (?:key )?['"]?(.+?)['"]?:?\s*$/i.exec(request);
	return match !== null ? match[1] : null;
}

function getHostVerificationPrompt(request: string): string {
	const hostMatch = /host ['"]([^'"]+)['"]/i.exec(request);
	const fingerprintMatch = /fingerprint is ([^\r\n]+)/i.exec(request);
	if (hostMatch !== null && fingerprintMatch !== null) {
		return vscode.l10n.t('{0} has fingerprint {1}. Continue connecting?', hostMatch[1], fingerprintMatch[1].replace(/\.\s*$/, ''));
	}
	return request;
}

function getIPCHandlePath(nonce: string): string {
	if (process.platform === 'win32') {
		return '\\\\.\\pipe\\git-graph-askpass-' + nonce + '-sock';
	} else if (process.env['XDG_RUNTIME_DIR']) {
		return path.join(process.env['XDG_RUNTIME_DIR'] as string, 'git-graph-askpass-' + nonce + '.sock');
	} else {
		return path.join(os.tmpdir(), 'git-graph-askpass-' + nonce + '.sock');
	}
}
