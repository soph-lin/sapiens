# sapiens

experience humanity. the only way to move forwards is to look back

## dev

### install pnpm (if you don't already have it)

`pnpm` is a package manager built on top of npm and is much faster than npm, being highly disk efficient and solving inherent issues in npm.

install `pnpm` if you don't already have it:

```bash
npm install -g pnpm
optional: set up a shorter alias like pn instead
```

for POSIX systems, add the following to your `.bashrc`, `.zshrc`, or `config.fish`:

```bash
alias pn=pnpm
```

for Powershell (Windows), go to a Powershell window with admin rights and run:

```bash
notepad $profile.AllUsersAllHosts
```

in the profile.ps1 file that opens, put:

```bash
set-alias -name pn -value pnpm
```

now whenever you have to run a `pnpm` cmd, you can type in `pn` (or whatever alias you created) instead.

### run

```
pnpm dev
```
