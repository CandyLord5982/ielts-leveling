import Phaser from 'phaser'

// ---- Tunables ----
const LEVEL = { width: 1280, height: 760 }
const GRAVITY = 1200
const MOVE_SPEED = 320
const JUMP_VELOCITY = -700
const COYOTE_MS = 90        // grace period to still jump just after leaving a ledge
const BUFFER_MS = 120       // remember a jump press made just before landing
const CUT_JUMP = 0.45       // release jump early -> shorter hop (variable height)
const SPAWN = { x: 640, y: 360 }
const MONSTER_H = 64        // on-screen height of an enemy; the big art is scaled down to this
const SPRING_VELOCITY = -1050  // spring launch — regular jump is JUMP_VELOCITY (-700)
const SPRING_H = 24         // on-screen height of a spring pad when using image art

// [x, y, width, height] — centred rectangles. Quincunx: 1 centre + 4 around it.
const PLATFORMS = [
  [640, 430, 240, 30],   // centre (player start)
  [330, 250, 220, 30],   // top-left
  [950, 250, 220, 30],   // top-right
  [330, 590, 220, 30],   // bottom-left
  [950, 590, 220, 30],   // bottom-right
]

// One coin hovering above each platform.
const COINS = [
  [640, 345], [330, 195], [950, 195], [330, 535], [950, 535],
]

// Spring pads: [x, ySurface] — x centre, y the platform surface it sits on.
// Landing on one launches the player at SPRING_VELOCITY (high enough to reach
// the top platforms from anywhere). Add more pairs to place more springs.
const SPRINGS = [
  [730, 415],   // right edge of the centre platform
]

// Question blocks: [x, y] centres. Bonk one from below (Mario-style) and a
// coin pops out; the block goes dark once spent. BLOCK_SIZE only applies to
// the hardcoded level — in a Tiled level blocks match the map's tile size.
const BLOCK_SIZE = 36
const BLOCKS = [
  [560, 270],   // pair floating above the centre platform
  [720, 270],
]

// Background images laid side by side, left to right, forming one long strip
// that repeats as the camera scrolls (A B C A B C ...). Files live in
// public/game/bg/; missing files are skipped. Different sizes are fine — each
// image is scaled to a common height when the strip is stitched.
const BG_IMAGES = ['bg1.png', 'bg2.png', 'bg3.png']
const BG_SPEED = 0.3   // parallax: the strip scrolls at 30% of the camera

// Level maps, played in order — each is a Tiled JSON in public/game/maps/
// sharing the same tileset.png. Finishing the quiz rounds on one level loads
// the next; the win screen shows after the last. Files that don't exist yet
// are skipped, so listing a map before you've made it is harmless.
const LEVELS = ['world', 'world2', 'world3']

// Monster slots — one per outer platform: [x, y, patrolHalfRange]
const ENEMIES = [
  [330, 215, 70],   // top-left
  [950, 215, 70],   // top-right
  [330, 555, 70],   // bottom-left
  [950, 555, 70],   // bottom-right
]

// ---- Vocabulary (placeholder bank — swap for the real xpclass word bank later) ----
// Each round shows `word` up top; the 4 monsters carry meanings, one of which is correct.
const WORD_BANK = [
  { word: 'Happy', meaning: 'Joyful' },
  { word: 'Big', meaning: 'Large' },
  { word: 'Fast', meaning: 'Quick' },
  { word: 'Cold', meaning: 'Chilly' },
  { word: 'Angry', meaning: 'Mad' },
  { word: 'Smart', meaning: 'Clever' },
  { word: 'Begin', meaning: 'Start' },
  { word: 'Tired', meaning: 'Sleepy' },
  { word: 'Brave', meaning: 'Fearless' },
  { word: 'Tiny', meaning: 'Small' },
]
const MAX_ROUNDS = 8

const shuffle = (arr) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default class PlatformerScene extends Phaser.Scene {
  constructor() {
    super('Platformer')
  }

  // Runs before preload/create, including on scene.restart(data): level
  // transitions pass the next level index and the running totals through here.
  init(data) {
    this.levelIndex = data.levelIndex || 0
    this.carry = data.carry || null
  }

  preload() {
    // Character sprite strips live in public/game/1/ — each is a 42x42 frame grid.
    // BASE_URL keeps paths correct if the app is ever deployed under a subpath.
    const base = import.meta.env.BASE_URL
    const opts = { frameWidth: 42, frameHeight: 42 }
    this.load.spritesheet('idle', `${base}game/1/Idle.png`, opts)  // 4 frames
    this.load.spritesheet('walk', `${base}game/1/Walk.png`, opts)  // 6 frames
    this.load.spritesheet('jump', `${base}game/1/Jump.png`, opts)  // 8 frames
    this.load.spritesheet('attack', `${base}game/1/Attack1.png`, opts)  // 6 frames

    // Platform art — 3 pieces (each 64x64): left cap, repeating middle, right cap.
    // Missing files just 404 (no crash); create() falls back to a single tile,
    // then to a flat block, depending on what's present.
    this.load.image('platform-left', `${base}game/tiles/platform-left.png`)
    this.load.image('platform-mid', `${base}game/tiles/platform-mid.png`)
    this.load.image('platform-right', `${base}game/tiles/platform-right.png`)
    this.load.image('platform-tile', `${base}game/tiles/platform.png`)  // single-tile fallback

    // Optional spring art — spring.png (compressed, the resting state) plus
    // spring_out.png (extended, flashed on launch). Missing files 404 back to
    // the drawn red pad / plain squash animation.
    this.load.image('spring', `${base}game/tiles/spring.png`)
    this.load.image('spring-out', `${base}game/tiles/spring_out.png`)

    // Optional question-block art — block.png (fresh) + block_used.png (spent).
    // Missing files 404 back to a drawn gold "?" block.
    this.load.image('block', `${base}game/tiles/block.png`)
    this.load.image('block-used', `${base}game/tiles/block_used.png`)

    // Background images (see BG_IMAGES) — stitched into one repeating strip
    // in create(); if none load, create() paints hills instead.
    BG_IMAGES.forEach((file, i) => this.load.image(`bg${i}`, `${base}game/bg/${file}`))

    // Tiled maps: every LEVELS entry is tried; missing ones 404 harmlessly and
    // get skipped. No maps at all (or no tileset) → the hardcoded arrays.
    this.load.image('tileset', `${base}game/maps/tileset.png`)
    LEVELS.forEach((key) => this.load.tilemapTiledJSON(key, `${base}game/maps/${key}.json`))

    // Enemy: 12-frame zombie walk cycle + 10-frame death (individual PNGs in public/game/enemy/).
    for (let i = 0; i < 12; i++) {
      this.load.image(`zombie${i}`, `${base}game/enemy/EM_ZOMBIE_Walk_${String(i).padStart(3, '0')}.png`)
    }
    for (let i = 0; i < 10; i++) {
      this.load.image(`zombie-die${i}`, `${base}game/enemy/EM_ZOMBIE_Dead_${String(i).padStart(3, '0')}.png`)
    }
  }

  create() {
    this.onStats = this.registry.get('onStats') || (() => {})

    // Load a Tiled map if present; otherwise everything below falls back to the
    // hardcoded SPAWN / PLATFORMS / COINS / ENEMIES constants at the top of the file.
    const map = this.loadTilemap()
    this.worldW = map ? map.widthInPixels : LEVEL.width
    this.worldH = map ? map.heightInPixels : LEVEL.height
    this.spawn = this.readSpawn(map)
    this.enemySlots = this.readEnemySlots(map)

    this.physics.world.setBounds(0, 0, this.worldW, this.worldH)
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH)
    this.cameras.main.setBackgroundColor('#87ceeb')

    // Background: the BG_IMAGES that loaded, stitched left-to-right into one
    // strip texture, shown as a camera-pinned tile sprite that repeats and
    // parallax-scrolls in update(). Painted hills if no image loaded.
    if (this.buildBgStrip()) {
      this.bg = this.add.tileSprite(0, 0, 0, 0, 'bg-strip')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(-10)
    } else {
      const bg = this.add.graphics().setScrollFactor(0.3).setDepth(-10)
      bg.fillStyle(0x9fd8a0, 1)
      for (let i = 0; i < 8; i++) {
        bg.fillCircle(200 + i * 300, 820, 220)
      }
    }

    // Ambient clouds drifting across the sky (drawn in code, no assets).
    this.addClouds()

    // --- Platforms ---
    // From a Tiled tile layer when a map is loaded, else from the PLATFORMS array.
    // Either way we get back the thing the player should collide against.
    this.groundTarget = map ? this.buildTiledPlatforms(map) : this.buildArrayPlatforms()

    // --- Coins ---
    // Point objects named "coin" in Tiled, else the COINS array. Question
    // blocks hold one coin each, so they count toward the total too.
    const coinSpots = this.readCoins(map)
    const blockSpots = this.readBlocks(map)
    this.coinTotal = (this.carry?.coinTotal || 0) + coinSpots.length + blockSpots.length
    this.coinsGot = this.carry?.coins || 0
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true })
    coinSpots.forEach(([x, y]) => {
      const coin = this.add.circle(x, y, 12, 0xffd700)
      coin.setStrokeStyle(3, 0xd4a017, 1)
      this.coins.add(coin)
    })

    // --- Springs ---
    // Point objects named "spring" in Tiled, else the SPRINGS array. Anchored
    // to the platform surface; hitSpring() does the launch. Uses the 'spring'
    // image when present, else a drawn red pad.
    this.springs = this.physics.add.staticGroup()
    const springArt = this.textures.exists('spring')
    this.readSprings(map).forEach(([x, y]) => {
      let pad
      if (springArt) {
        pad = this.add.image(x, y, 'spring').setOrigin(0.5, 1)
        pad.setScale(SPRING_H / pad.height)   // shrink to game size, keep aspect
      } else {
        pad = this.add.rectangle(x, y, 40, 16, 0xe53935).setOrigin(0.5, 1)
        pad.setStrokeStyle(3, 0x991b1b, 1)
      }
      this.springs.add(pad)
    })
    this.springing = false   // true mid-launch: suppresses the early-release jump cut

    // --- Question blocks ---
    // Solid blocks the player can stand on; a header from below pops out a
    // coin (hitBlock). Uses the 'block' image when present, else a drawn
    // gold "?" square.
    this.blocks = this.physics.add.staticGroup()
    const blockArt = this.textures.exists('block')
    // Same size as the map's collision tiles so blocks sit flush on the grid;
    // the hardcoded level has no grid, so it keeps the smaller BLOCK_SIZE.
    this.blockSize = map ? map.tileWidth : BLOCK_SIZE
    blockSpots.forEach(([x, y]) => {
      let block
      if (blockArt) {
        block = this.add.image(x, y, 'block').setDisplaySize(this.blockSize, this.blockSize)
      } else {
        block = this.add.rectangle(x, y, this.blockSize, this.blockSize, 0xf6a821)
        block.setStrokeStyle(3, 0x8a5a00, 1)
        block.qMark = this.add.text(x, y, '?', {
          fontFamily: 'sans-serif', fontSize: '22px', fontStyle: 'bold',
          color: '#fff7d6', stroke: '#8a5a00', strokeThickness: 4,
        }).setOrigin(0.5)
      }
      this.blocks.add(block)
    })

    this.won = false

    // --- Monsters (filled each round with meaning options) ---
    this.enemies = this.physics.add.group({ allowGravity: false, immovable: true })

    // --- Quiz round state ---
    this.bank = this.buildBank()
    this.roundsTotal = Math.min(MAX_ROUNDS, this.bank.length)
    this.order = shuffle(this.bank).slice(0, this.roundsTotal)
    this.roundIndex = 0
    this.correct = this.carry?.correct || 0
    this.wrong = this.carry?.wrong || 0
    this.prevRounds = this.carry?.rounds || 0   // rounds played on earlier levels
    this.resolving = false
    this.currentWord = null
    this.lastResult = null

    // --- Animations (one strip per state) ---
    this.anims.create({ key: 'a-idle', frames: this.anims.generateFrameNumbers('idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 })
    this.anims.create({ key: 'a-walk', frames: this.anims.generateFrameNumbers('walk', { start: 0, end: 5 }), frameRate: 10, repeat: -1 })
    this.anims.create({ key: 'a-jump', frames: this.anims.generateFrameNumbers('jump', { start: 0, end: 7 }), frameRate: 12, repeat: 0 })
    this.anims.create({ key: 'a-attack', frames: this.anims.generateFrameNumbers('attack', { start: 0, end: 5 }), frameRate: 16, repeat: 0 })
    this.anims.create({
      key: 'a-zombie-walk',
      frames: Array.from({ length: 12 }, (_, i) => ({ key: `zombie${i}` })),
      frameRate: 12, repeat: -1,
    })
    this.anims.create({
      key: 'a-zombie-die',
      frames: Array.from({ length: 10 }, (_, i) => ({ key: `zombie-die${i}` })),
      frameRate: 14, repeat: 0,
    })

    // --- Player (animated sprite) ---
    this.player = this.physics.add.sprite(this.spawn.x, this.spawn.y, 'idle')
    this.player.setScale(2.2)   // ~92px tall (1.4x the 64px tile) — reads bigger than the 64px-tall enemies, Mario-style
    this.player.play('a-idle')
    this.player.body.setCollideWorldBounds(false)
    this.player.body.setMaxVelocity(MOVE_SPEED, 2000)
    // Collision box tighter than the 42x42 frame, feet aligned to the bottom.
    this.player.body.setSize(20, 32)
    this.player.body.setOffset(11, 10)
    this.facing = 1
    this.attacking = false
    this.attackUntil = 0

    this.physics.world.gravity.y = GRAVITY

    this.physics.add.collider(this.player, this.groundTarget)
    this.physics.add.collider(this.player, this.blocks, this.hitBlock, null, this)
    this.physics.add.collider(this.player, this.springs, this.hitSpring, null, this)
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, null, this)
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy, null, this)

    // --- Camera ---
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setDeadzone(120, 200)

    // --- Input ---
    this.cursors = this.input.keyboard.createCursorKeys()
    this.keys = this.input.keyboard.addKeys('W,A,D,SPACE')
    // Stop Space/arrows from scrolling the page behind the game.
    this.input.keyboard.addCapture('SPACE,UP,DOWN,LEFT,RIGHT,W,A,S,D')
    this.lastGroundedAt = -9999
    this.lastJumpPressedAt = -9999
    this.jumpHeld = false

    // Tap anywhere = jump (mobile-friendly)
    this.input.on('pointerdown', () => { this.lastJumpPressedAt = this.time.now; this.jumpHeld = true })
    this.input.on('pointerup', () => { this.jumpHeld = false })

    this.deaths = this.carry?.deaths || 0
    this.startRound()
  }

  // Stitch the loaded BG_IMAGES side by side into one 'bg-strip' canvas
  // texture, each image scaled to the tallest one's height so the row lines
  // up. Built once — textures survive scene restarts. True if a strip exists.
  buildBgStrip() {
    if (this.textures.exists('bg-strip')) return true
    const srcs = BG_IMAGES
      .map((_, i) => `bg${i}`)
      .filter((k) => this.textures.exists(k))
      .map((k) => this.textures.get(k).getSourceImage())
    if (!srcs.length) return false

    const height = Math.max(...srcs.map((s) => s.height))
    const widths = srcs.map((s) => s.width * (height / s.height))
    const width = Math.ceil(widths.reduce((a, b) => a + b, 0))

    const canvas = this.textures.createCanvas('bg-strip', width, height)
    const ctx = canvas.getContext()
    let x = 0
    srcs.forEach((s, i) => {
      ctx.drawImage(s, 0, 0, s.width, s.height, x, 0, widths[i], height)
      x += widths[i]
    })
    canvas.refresh()
    return true
  }

  // Soft white clouds drifting near the top of the world. Drawn once to a
  // texture (no image assets), placed at 0.5 scroll factor for light parallax.
  addClouds() {
    if (!this.textures.exists('cloud')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0xffffff, 1)
      g.fillEllipse(65, 40, 120, 44)
      g.fillEllipse(32, 48, 60, 30)
      g.fillEllipse(98, 48, 62, 32)
      g.fillEllipse(58, 26, 70, 34)
      g.generateTexture('cloud', 130, 64)
      g.destroy()
    }
    const count = Math.max(4, Math.round(this.worldW / 480))
    for (let i = 0; i < count; i++) {
      const x = Math.random() * this.worldW
      const y = 40 + Math.random() * 160
      const cloud = this.add.image(x, y, 'cloud')
        .setScale(0.7 + Math.random() * 0.9)
        .setAlpha(0.85)
        .setScrollFactor(0.5)
        .setDepth(-8)
      // Slow horizontal drift, back and forth forever.
      this.tweens.add({
        targets: cloud,
        x: x + 80 + Math.random() * 140,
        duration: 9000 + Math.random() * 9000,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }
  }

  // ---- World building (Tiled map when present, hardcoded arrays otherwise) ----

  // The current level's tilemap. levelKeys is LEVELS minus files that failed
  // to load; null (→ hardcoded arrays) if no maps or no tileset are available.
  loadTilemap() {
    this.levelKeys = LEVELS.filter((k) => this.cache.tilemap.has(k))
    if (!this.levelKeys.length || !this.textures.exists('tileset')) return null
    this.levelIndex = Math.min(this.levelIndex, this.levelKeys.length - 1)
    return this.make.tilemap({ key: this.levelKeys[this.levelIndex] })
  }

  // Solid platforms from a Tiled tile layer. Every non-empty tile on the
  // "collision" layer (or the first tile layer if there's no such name) is solid.
  // Returns the layer, which is what the player collides against.
  buildTiledPlatforms(map) {
    const tileset = map.addTilesetImage(map.tilesets[0].name, 'tileset')
    const layer = map.getLayer('collision')
      ? map.createLayer('collision', tileset, 0, 0)
      : map.createLayer(0, tileset, 0, 0)
    layer.setCollisionByExclusion([-1])   // -1 = empty tile; every painted tile is solid
    this.mapLayer = layer

    // Optional "decor" tile layer: purely visual, no collision. Paint bushes,
    // fences, signs etc. on it in Tiled; it draws behind the gameplay layer.
    if (map.getLayer('decor')) map.createLayer('decor', tileset, 0, 0).setDepth(-5)

    return layer
  }

  // Platforms from the PLATFORMS array, with the layered art (caps + repeating
  // middle) and its fallbacks. Returns the static group to collide against.
  buildArrayPlatforms() {
    this.platforms = this.physics.add.staticGroup()
    const hasCaps = ['platform-left', 'platform-mid', 'platform-right'].every((k) => this.textures.exists(k))
    const hasTile = this.textures.exists('platform-tile')
    PLATFORMS.forEach(([x, y, w, h]) => {
      const isGround = h >= 50

      if (hasCaps) {
        // One invisible rectangle carries the collision; the art layers on top.
        const body = this.add.rectangle(x, y, w, h).setVisible(false)
        this.platforms.add(body)

        const capW = Math.min(h, w / 2)          // square caps at platform height
        const midW = Math.max(0, w - capW * 2)   // middle fills the gap between caps
        const midSrc = this.textures.get('platform-mid').getSourceImage()
        const s = h / midSrc.height              // scale so one tile fills the height

        if (midW > 0) {
          const mid = this.add.tileSprite(x, y, midW, h, 'platform-mid')
          mid.setTileScale(s, s)
        }
        this.add.image(x - w / 2 + capW / 2, y, 'platform-left').setDisplaySize(capW, h)
        this.add.image(x + w / 2 - capW / 2, y, 'platform-right').setDisplaySize(capW, h)
        return
      }

      let block
      if (hasTile) {
        block = this.add.tileSprite(x, y, w, h, 'platform-tile')
        // Tiles draw at native px; our tile is 64x64 but platforms are ~30 tall.
        // Scale so exactly one tile fills the height (square, no vertical crop).
        const src = this.textures.get('platform-tile').getSourceImage()
        const s = h / src.height
        block.setTileScale(s, s)
      } else {
        block = this.add.rectangle(x, y, w, h, isGround ? 0x6b8e23 : 0x8b5a2b)
        block.setStrokeStyle(3, 0x000000, 0.15)
      }
      this.platforms.add(block)
    })
    return this.platforms
  }

  // Coin positions: [x, y] point objects named "coin", else the COINS array.
  readCoins(map) {
    const pts = this.readPoints(map, 'coin')
    return pts.length ? pts.map((o) => [o.x, o.y]) : COINS
  }

  // Spring positions: [x, ySurface] point objects named "spring". Unlike coins,
  // no fallback when a map is loaded — the hardcoded SPRINGS coordinates only
  // make sense in the hardcoded level, they'd float mid-air in a Tiled world.
  readSprings(map) {
    if (map) return this.readPoints(map, 'spring').map((o) => [o.x, o.y])
    return SPRINGS
  }

  // Question-block positions: [x, y] point objects named "block". Same rule as
  // springs — no hardcoded fallback when a Tiled map is loaded, the BLOCKS
  // coordinates only make sense in the hardcoded level.
  readBlocks(map) {
    if (map) {
      // Snap each point to the centre of the tile cell it lands in, so blocks
      // align with the grid no matter where in the cell the point was dropped.
      const tw = map.tileWidth
      const th = map.tileHeight
      return this.readPoints(map, 'block').map((o) => [
        Math.floor(o.x / tw) * tw + tw / 2,
        Math.floor(o.y / th) * th + th / 2,
      ])
    }
    return BLOCKS
  }

  // Player spawn: a point object named "spawn", else the SPAWN constant.
  readSpawn(map) {
    const [s] = this.readPoints(map, 'spawn')
    return s ? { x: s.x, y: s.y } : SPAWN
  }

  // Monster slots: point objects named "enemy" (optional "range" property for the
  // patrol half-width), else the ENEMIES array. Shape: [x, y, range].
  readEnemySlots(map) {
    const pts = this.readPoints(map, 'enemy')
    if (!pts.length) return ENEMIES
    return pts.map((o) => [o.x, o.y, this.prop(o, 'range', 70)])
  }

  // Every object with a given name on the "objects" object layer ([] if no map).
  readPoints(map, name) {
    if (!map) return []
    const layer = map.getObjectLayer('objects')
    return layer ? layer.objects.filter((o) => o.name === name) : []
  }

  // Read a custom property off a Tiled object, with a default.
  prop(obj, name, fallback) {
    const p = (obj.properties || []).find((x) => x.name === name)
    return p ? p.value : fallback
  }

  collectCoin(player, coin) {
    coin.destroy()
    this.coinsGot++
    this.emitStats()
  }

  hitBlock(player, block) {
    // Only a header from below pops the coin — landing on top or brushing the
    // side is just ordinary collision.
    if (!(player.body.touching.up && block.body.touching.down)) return
    if (block.used) return
    block.used = true

    // The classic bump: block (and its "?" label) hops up and settles back.
    // Only the display object moves — the static body stays where it is.
    const bumpTargets = block.qMark ? [block, block.qMark] : [block]
    bumpTargets.forEach((t) => {
      this.tweens.add({ targets: t, y: t.y - 8, yoyo: true, duration: 80, ease: 'Quad.easeOut' })
    })

    // Coin pops out the top, rises and fades — collected instantly.
    const coin = this.add.circle(block.x, block.y - this.blockSize, 12, 0xffd700)
    coin.setStrokeStyle(3, 0xd4a017, 1)
    this.tweens.add({
      targets: coin, y: coin.y - 48, alpha: 0, duration: 450, ease: 'Quad.easeOut',
      onComplete: () => coin.destroy(),
    })
    this.coinsGot++
    this.emitStats()

    // Spent look, once the bump settles: swap to the used art, or dim the
    // drawn block and blank its "?".
    this.time.delayedCall(160, () => {
      if (!block.active) return
      if (this.textures.exists('block-used') && block.setTexture) {
        block.setTexture('block-used')
      } else if (block.setFillStyle) {
        block.setFillStyle(0x9a7b4f)
        if (block.qMark) block.qMark.setText('')
      }
    })
  }

  hitSpring(player, spring) {
    // Only a landing triggers the launch — brushing the side does nothing.
    if (!(player.body.touching.down && spring.body.touching.up)) return
    player.body.setVelocityY(SPRING_VELOCITY)
    this.springing = true
    this.lastGroundedAt = -9999   // no coyote jump stacking on top of the launch
    player.play('a-jump', true)
    // Launch feedback: pop to the extended frame for a beat (image springs),
    // else squash the drawn pad. Rectangles have no setTexture, hence the guard.
    if (spring.setTexture && this.textures.exists('spring-out')) {
      spring.setTexture('spring-out')
      this.time.delayedCall(150, () => { if (spring.active) spring.setTexture('spring') })
    } else {
      this.tweens.add({ targets: spring, scaleY: 0.4, yoyo: true, duration: 70 })
    }
  }

  hitEnemy(player, enemy) {
    // Touching is harmless — attacking the correct-meaning monster is what counts.
    if (this.attacking) this.resolveHit(enemy)
  }

  // Sweep a hitbox in front of the player; strike the monster caught in it.
  swingAttack() {
    const REACH = 64
    const V_TOLERANCE = 44
    let target = null
    this.enemies.children.iterate((e) => {
      if (!e || !e.body) return true
      const dx = (e.x - this.player.x) * this.facing   // >0 means in front
      const dy = Math.abs(e.y - this.player.y)
      if (dx > -12 && dx < REACH && dy < V_TOLERANCE) target = e
      return true
    })
    if (target) this.resolveHit(target)
  }

  resolveHit(enemy) {
    if (this.resolving || this.won) return
    this.resolving = true

    const correct = !!enemy.isCorrect
    if (correct) this.correct++
    else this.wrong++
    this.lastResult = correct ? 'correct' : 'wrong'

    // Round resolves: the struck monster plays its death animation, the rest
    // clear instantly, then the next word loads after a beat.
    this.killMonster(enemy)
    this.clearMonsters()
    this.emitStats()

    this.roundIndex++
    this.time.delayedCall(900, () => {
      this.resolving = false
      if (this.roundIndex >= this.roundsTotal) {
        // More maps in LEVELS? Advance. Otherwise this was the last level: win.
        if (this.levelIndex < this.levelKeys.length - 1) {
          this.nextLevel()
        } else {
          this.won = true
          this.player.body.setVelocity(0, 0)
          this.player.body.setAllowGravity(false)
          this.emitStats()
        }
      } else {
        this.startRound()
      }
    })
  }

  // All rounds on this map are done and another map remains: freeze the player,
  // flash a banner, then restart the scene on the next map with totals carried.
  nextLevel() {
    this.player.body.setVelocity(0, 0)
    this.player.body.setAllowGravity(false)
    const cam = this.cameras.main
    this.add.text(cam.width / 2, cam.height / 2, `Level ${this.levelIndex + 2}!`, {
      fontFamily: 'sans-serif', fontSize: '48px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20)
    this.time.delayedCall(1500, () => {
      this.scene.restart({
        levelIndex: this.levelIndex + 1,
        carry: {
          correct: this.correct, wrong: this.wrong, deaths: this.deaths,
          coins: this.coinsGot, coinTotal: this.coinTotal,
          rounds: this.prevRounds + this.roundsTotal,
        },
      })
    })
  }

  // Death sequence for the monster that was struck: pull it out of the group
  // (which disables its body, freezing the patrol), play the death animation,
  // then fade the corpse out and destroy it.
  killMonster(e) {
    if (e.label) { e.label.destroy(); e.label = null }
    this.enemies.remove(e)
    e.play('a-zombie-die')
    e.once('animationcomplete', () => {
      this.tweens.add({ targets: e, alpha: 0, duration: 200, onComplete: () => e.destroy() })
    })
  }

  clearMonsters() {
    this.enemies.children.iterate((e) => { if (e && e.label) e.label.destroy() })
    this.enemies.clear(true, true)
  }

  // Use the word bank passed in via the registry, else the built-in sample.
  // Accepts flexible entry shapes: {word|term|front, meaning|hint|definition|back}.
  buildBank() {
    const provided = this.registry.get('wordBank')
    const norm = (provided || [])
      .map((e) => ({
        word: e.word ?? e.term ?? e.front,
        meaning: e.meaning ?? e.hint ?? e.definition ?? e.back,
      }))
      .filter((e) => e.word && e.meaning)
    // Need at least 4 entries for 1 correct + 3 distractor meanings.
    return norm.length >= 4 ? norm : WORD_BANK
  }

  startRound() {
    const entry = this.order[this.roundIndex]
    this.currentWord = entry

    // Correct meaning + 3 distractor meanings from other words, then shuffle.
    const distractors = shuffle(this.bank.filter((w) => w.meaning !== entry.meaning))
      .slice(0, this.enemySlots.length - 1)
      .map((w) => ({ text: w.meaning, isCorrect: false }))
    const options = shuffle([{ text: entry.meaning, isCorrect: true }, ...distractors])

    this.clearMonsters()
    options.forEach((opt, i) => {
      const [x, y, range] = this.enemySlots[i]
      const e = this.add.sprite(x, y, 'zombie0')
      e.setScale(MONSTER_H / e.height)     // shrink the big art to game size (keeps aspect)
      e.play('a-zombie-walk')
      this.enemies.add(e)
      e.body.setSize(300, 470)             // tighter hitbox than the padded frame (auto-scales)
      e.body.setVelocityX(80)
      // NOTE: not `originX` — that's a real Phaser property (display origin, 0..1);
      // overwriting it with a pixel coordinate shifts the sprite off-screen.
      e.patrolX = x
      e.range = range
      e.isCorrect = opt.isCorrect
      e.label = this.add.text(x, y - MONSTER_H / 2 - 14, opt.text, {
        fontFamily: 'sans-serif', fontSize: '16px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(5)
    })

    this.lastResult = null
    this.emitStats()
  }

  respawn() {
    this.deaths++
    this.player.body.setVelocity(0, 0)
    this.player.setPosition(this.spawn.x, this.spawn.y)
    this.emitStats()
  }

  emitStats() {
    this.onStats({
      word: this.currentWord ? this.currentWord.word : '',
      round: Math.min(this.roundIndex + 1, this.roundsTotal),
      roundsTotal: this.roundsTotal,
      totalRounds: this.prevRounds + this.roundsTotal,   // across all levels so far
      level: this.levelIndex + 1,
      levelsTotal: Math.max(1, this.levelKeys.length),
      correct: this.correct,
      wrong: this.wrong,
      lastResult: this.lastResult,
      coins: this.coinsGot,
      coinTotal: this.coinTotal,
      deaths: this.deaths,
      won: this.won,
    })
  }

  update(time) {
    // --- Background strip: fill the (resizable) viewport, parallax scroll ---
    if (this.bg) {
      const cam = this.cameras.main
      if (this.bg.width !== cam.width || this.bg.height !== cam.height) {
        this.bg.setSize(cam.width, cam.height)
        this.bg.setTileScale(cam.height / this.bg.frame.height)  // fill the viewport height
      }
      this.bg.setTilePosition(cam.scrollX * BG_SPEED / this.bg.tileScaleX, 0)
    }

    if (!this.player || !this.player.body) return

    // --- Monster patrol (labels follow) ---
    this.enemies.children.iterate((e) => {
      if (!e || !e.body) return true
      if (e.x > e.patrolX + e.range && e.body.velocity.x > 0) e.body.setVelocityX(-80)
      else if (e.x < e.patrolX - e.range && e.body.velocity.x < 0) e.body.setVelocityX(80)
      if (e.setFlipX) e.setFlipX(e.body.velocity.x > 0)   // face the way it's walking
      if (e.label) e.label.setPosition(e.x, e.y - MONSTER_H / 2 - 14)
      return true
    })

    if (this.won) {
      this.player.body.setVelocityX(0)
      return
    }

    const body = this.player.body
    const onGround = body.blocked.down || body.touching.down
    if (onGround) this.lastGroundedAt = time

    // --- Horizontal movement ---
    const left = this.cursors.left.isDown || this.keys.A.isDown
    const right = this.cursors.right.isDown || this.keys.D.isDown
    if (left && !right) body.setVelocityX(-MOVE_SPEED)
    else if (right && !left) body.setVelocityX(MOVE_SPEED)
    else body.setVelocityX(0)

    // --- Jump input (with buffer) — Space is attack now, so jump is W / Up / tap ---
    const jumpKey = this.cursors.up.isDown || this.keys.W.isDown
    const jumpJustPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.W)
    if (jumpJustPressed) this.lastJumpPressedAt = time
    this.jumpHeld = jumpKey || this.jumpHeld

    // Coyote time + jump buffer: jump if we pressed recently AND were grounded recently.
    const canCoyote = time - this.lastGroundedAt <= COYOTE_MS
    const bufferedJump = time - this.lastJumpPressedAt <= BUFFER_MS
    if (bufferedJump && canCoyote) {
      body.setVelocityY(JUMP_VELOCITY)
      this.lastJumpPressedAt = -9999
      this.lastGroundedAt = -9999
    }

    // Variable jump height: release early while rising -> cut the jump short.
    // A spring launch is exempt (this.springing) until the rise ends.
    if (this.springing && (body.velocity.y >= 0 || onGround)) this.springing = false
    if (!jumpKey && !this.jumpHeld && body.velocity.y < 0 && !this.springing) {
      body.setVelocityY(body.velocity.y * CUT_JUMP)
    }
    if (!jumpKey) this.jumpHeld = false

    // --- Attack (Space) ---
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) && !this.attacking) {
      this.attacking = true
      this.attackUntil = time + 375   // ~6 frames @ 16fps
      this.player.play('a-attack', true)
      this.swingAttack()
    }
    if (this.attacking && time >= this.attackUntil) this.attacking = false

    // --- Animation + facing ---
    if (left && !right) this.facing = -1
    else if (right && !left) this.facing = 1
    this.player.setFlipX(this.facing === -1)

    if (this.attacking) {
      // Attack animation owns the sprite until it finishes.
    } else if (!onGround) {
      if (this.player.anims.currentAnim?.key !== 'a-jump') this.player.play('a-jump', true)
    } else if (body.velocity.x !== 0) {
      this.player.play('a-walk', true)
    } else {
      this.player.play('a-idle', true)
    }

    // --- Fell off the world ---
    if (this.player.y > this.worldH + 100) this.respawn()
  }
}

// Phaser boots once inside a React effect, so Vite's hot-swap of this module
// never reaches the running game (the old scene class keeps playing). Force a
// full page reload instead so edits here always take effect. Dev-only.
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload())
}
