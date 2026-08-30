Fixing a broken global npm prefix and recommended local setup

Problem
Sometimes a system-level npm installation is misconfigured, leading to npm complaining about permissions when installing global packages and to conflicts with the Node version.

Quick checks
- Check current prefix: npm config get prefix
- On many modern systems, the recommended approach is to avoid installing global packages as root and instead set a user local prefix.

User-level fix (recommended)
1. Create a directory for global packages in the home folder:
   mkdir -p "$HOME/.npm-global"
2. Configure npm to use it:
   npm config set prefix "$HOME/.npm-global"
3. Add to PATH by adding this to your shell rc (~/.profile, ~/.bashrc, or ~/.zshrc):
   export PATH="$HOME/.npm-global/bin:$PATH"
4. Restart your shell or source the file: source ~/.profile

System-level / root-level problems
- If the system Node/npm was installed by package manager and prefix points to /usr or /usr/local, prefer either using the package manager or use nvm (Node Version Manager) to have per-user node and npm.

Using nvm (recommended for developers)
- Install nvm: https://github.com/nvm-sh/nvm
- Install and use Node: nvm install 20 && nvm use 20

Notes for CI / GitHub Actions
- The provided workflows use the actions/setup-node action so CI will be isolated from your host npm configuration.

Image filename guidance
- Current repo used content-hash filenames which are useful for cache-busting but make editorial workflows hard.
- Use a predictable naming policy for news assets: YYYY-MM-DD_slug.ext and keep a mapping file when renaming to preserve references.
