# sapiens

experience humanity. the only way to move forwards is to look back

**_a voyage is:_**

an adventure where you travel back in time to a particular historical period or event. they can be assigned by the captain (teacher) of your fleet (classroom) or created by as a solo adventure.

**_the starstream is:_**

a forum where you can share and reply to discoveries and takeaways from voyages and historical eras with fellow cadets (students)

**_stars are:_**

mystical manifestations of people from the past. they have landed in your ship to communicate with you, and help you understand humanity by starting at the very beginning.

**_your mission:_**

to remember humanity. set in a world far far away in the future, humans are tasked with.

well, that's the in-game answer. what about the real world?

we want you to love learning, and not get dulled by standardized education. to develop a love for the world and what it took to get here, and to make you believe in a brighter future.

**_our mission:_**

to make education feel real. to make kids lifelong learners.

**_so what are you waiting for, cadet?_**

try sapiens now at [sapiens.sophli.in](http://sapiens.sophli.in)

the stars look forward to your arrival.

## pages

`/` auraful hero page

`/nexus` share discoveries with fellow cadets

`/ship` your home

`/sail` sail away to a new world

`/home` chat with stars of the past

## dev-features

`/steer` plan voyages

`/voyages` view voyages

`/draw` create map layouts

[d] to debug on certain pages (`/ship`, `/nexus`, `/home`)

## tech

[openai](https://openai.com) & [anthropic](https://www.anthropic.com) for llms

[pixellab](https://www.pixellab.ai) for pixel art gen

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

### init

create `.env.local` ref. [.env.example](.env.example)

### run

```
pnpm dev
```
