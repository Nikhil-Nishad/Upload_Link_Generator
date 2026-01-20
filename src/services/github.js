import { Octokit } from 'octokit';
import { config } from '../config.js';

const octokit = new Octokit({
    auth: config.github.token,
});

export const githubService = {
    ensureStorageBranch: async () => {
        try {
            await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
                owner: config.github.owner,
                repo: config.github.repo,
                branch: config.github.storageBranch,
            });
            console.log(`Storage branch '${config.github.storageBranch}' exists.`);
        } catch (error) {
            if (error.status === 404) {
                console.log(`Storage branch '${config.github.storageBranch}' not found. Creating it...`);
                // Get sha of main base
                const { data: mainRef } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
                    owner: config.github.owner,
                    repo: config.github.repo,
                    ref: `heads/${config.github.branch}`,
                });

                // Create new branch
                await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
                    owner: config.github.owner,
                    repo: config.github.repo,
                    ref: `refs/heads/${config.github.storageBranch}`,
                    sha: mainRef.object.sha,
                });
                console.log(`Created branch '${config.github.storageBranch}'.`);
            } else {
                throw error;
            }
        }
    },

    uploadFile: async (path, content, message) => {
        try {
            // Content must be base64 encoded for binary files
            const contentEncoded = Buffer.isBuffer(content)
                ? content.toString('base64')
                : Buffer.from(content).toString('base64');

            await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: config.github.owner,
                repo: config.github.repo,
                path: path,
                message: message,
                content: contentEncoded,
                branch: config.github.storageBranch,
            });
            return true;
        } catch (error) {
            console.error(`Error uploading file to GitHub: ${path}`, error.message);
            throw error;
        }
    },

    getFile: async (path) => {
        try {
            const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: config.github.owner,
                repo: config.github.repo,
                path: path,
                branch: config.github.storageBranch,
                t: Date.now() // Cache busting
            });

            // Decode content
            if (data.content && data.encoding === 'base64') {
                const decodedContent = Buffer.from(data.content, 'base64').toString('utf-8');
                return { content: decodedContent, sha: data.sha };
            }
            return null;
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            console.error(`Error getting file from GitHub: ${path}`, error.message);
            throw error;
        }
    },

    updateFile: async (path, content, message, sha) => {
        try {
            const contentEncoded = Buffer.from(content).toString('base64');
            await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: config.github.owner,
                repo: config.github.repo,
                path: path,
                message: message,
                content: contentEncoded,
                branch: config.github.storageBranch,
                sha: sha
            });
            return true;
        } catch (error) {
            console.error(`Error updating file on GitHub: ${path}`, error.message);
            throw error;
        }
    },

    getFileSha: async (path) => {
        try {
            const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: config.github.owner,
                repo: config.github.repo,
                path: path,
                branch: config.github.storageBranch,
                t: Date.now() // Cache busting
            });
            return data.sha;
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            throw error;
        }
    },

    deleteFile: async (path, message, sha) => {
        try {
            // We need the SHA to delete
            let fileSha = sha;
            if (!fileSha) {
                fileSha = await githubService.getFileSha(path);
            }

            if (!fileSha) {
                console.warn(`File not found for deletion: ${path}`);
                return false;
            }

            await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
                owner: config.github.owner,
                repo: config.github.repo,
                path: path,
                message: message,
                branch: config.github.storageBranch,
                sha: fileSha,
            });
            return true;
        } catch (error) {
            console.error(`Error deleting file from GitHub: ${path}`, error.message);
            throw error;
        }
    }
};
