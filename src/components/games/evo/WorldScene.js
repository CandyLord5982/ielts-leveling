import Phaser from 'phaser'

// ---- Tunables ----
const WORLD = { width: 2600, height: 2600 }
const FOOD_COUNT = 70
const ENEMY_COUNT = 9
const BASE_RADIUS = 16
const BASE_SPEED = 260

// XP needed to *reach* each level (index = level - 1).
const LEVEL_XP = [0, 30, 80, 150, 250, 400, 620, 900, 1300]

// Creature colour per level (loops if you go past the end).
const CREATURE_COLORS = [0x38bdf8, 0x22d3ee, 0x34d399, 0xa3e635, 0xfbbf24, 0xf97316, 0xf43f5e, 0xa855f7]

const FOOD_COLORS = [0xf87171, 0xfbbf24, 0x34d399, 0xa78bfa, 0xf472b6, 0x60a5fa]

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('World')
  }

  create() {
    this.onStats = this.registry.get('onStats') || (() => {})

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height)

    // --- Background: subtle dot grid so movement is readable ---
    this.cameras.main.setBackgroundColor('#0b1220')
    const g = this.add.graphics()
    g.fillStyle(0x1e293b, 1)
    for (let x = 0; x < WORLD.width; x += 80) {
      for (let y = 0; y < WORLD.height; y += 80) {
        g.fillRect(x, y, 2, 2)
      }
    }
    g.setDepth(-10)

    // World border
    const border = this.add.graphics()
    border.lineStyle(6, 0x334155, 1)
    border.strokeRect(0, 0, WORLD.width, WORLD.height)
    border.setDepth(-9)

    // --- Player ---
    this.radius = BASE_RADIUS
    this.xp = 0
    this.level = 1

    this.player = this.add.circle(WORLD.width / 2, WORLD.height / 2, this.radius, CREATURE_COLORS[0])
    this.player.setStrokeStyle(3, 0xffffff, 0.9)
    this.physics.add.existing(this.player)
    this.player.body.setCircle(this.radius)
    this.player.body.setCollideWorldBounds(true)

    // A little eye so you can tell which way is "up" — purely cosmetic.
    this.eye = this.add.circle(this.player.x, this.player.y, 4, 0x0b1220).setDepth(5)

    // --- Camera ---
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09)

    // --- Food ---
    this.foods = this.physics.add.group()
    for (let i = 0; i < FOOD_COUNT; i++) this.spawnFood()
    this.physics.add.overlap(this.player, this.foods, this.eatFood, null, this)

    // --- Enemies ---
    this.enemies = this.physics.add.group()
    for (let i = 0; i < ENEMY_COUNT; i++) this.spawnEnemy()
    this.physics.add.overlap(this.player, this.enemies, this.touchEnemy, null, this)

    // --- Input: move toward pointer (like .io games) + WASD/arrows ---
    this.cursors = this.input.keyboard.createCursorKeys()
    this.keys = this.input.keyboard.addKeys('W,A,S,D')
    this.pointerActive = false
    this.input.on('pointerdown', () => { this.pointerActive = true })
    this.input.on('pointerup', () => { this.pointerActive = false })

    this.emitStats()
  }

  spawnFood() {
    const x = Phaser.Math.Between(24, WORLD.width - 24)
    const y = Phaser.Math.Between(24, WORLD.height - 24)
    const color = Phaser.Utils.Array.GetRandom(FOOD_COLORS)
    const food = this.add.circle(x, y, 7, color)
    this.foods.add(food)
    food.body.setCircle(7)
    return food
  }

  spawnEnemy() {
    // Spawn away from the player so nothing pops on top of you.
    let x, y
    do {
      x = Phaser.Math.Between(40, WORLD.width - 40)
      y = Phaser.Math.Between(40, WORLD.height - 40)
    } while (this.player && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 400)

    const r = Phaser.Math.Between(10, 30)
    const enemy = this.add.circle(x, y, r, 0x64748b)
    enemy.setStrokeStyle(2, 0x0f172a, 0.8)
    this.enemies.add(enemy)
    enemy.body.setCircle(r)
    enemy.radius = r
    enemy.wanderAngle = Phaser.Math.FloatBetween(0, Math.PI * 2)
    return enemy
  }

  eatFood(player, food) {
    food.destroy()
    this.gainXp(5)
    this.grow(0.9)
    this.spawnFood()
  }

  touchEnemy(player, enemy) {
    if (this.radius > enemy.radius + 2) {
      // You're bigger — eat it.
      const gained = Math.round(enemy.radius)
      enemy.destroy()
      this.gainXp(gained)
      this.grow(enemy.radius * 0.15)
      this.spawnEnemy()
    } else {
      // Bigger enemy hurt you — lose XP + shrink + knockback.
      this.gainXp(-8)
      this.shrink(4)
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y)
      player.body.setVelocity(Math.cos(angle) * 500, Math.sin(angle) * 500)
      this.cameras.main.shake(120, 0.006)
    }
  }

  grow(amount) {
    this.setRadius(this.radius + amount)
  }

  shrink(amount) {
    this.setRadius(Math.max(BASE_RADIUS, this.radius - amount))
  }

  setRadius(r) {
    this.radius = r
    this.player.setRadius(r)
    // Keep the physics body centred on the new circle.
    this.player.body.setCircle(r)
    this.emitStats()
  }

  gainXp(amount) {
    this.xp = Math.max(0, this.xp + amount)
    // Level up / down based on thresholds.
    let lvl = 1
    for (let i = 0; i < LEVEL_XP.length; i++) {
      if (this.xp >= LEVEL_XP[i]) lvl = i + 1
    }
    if (lvl !== this.level) {
      this.level = lvl
      this.player.fillColor = CREATURE_COLORS[(lvl - 1) % CREATURE_COLORS.length]
      if (lvl > 1) this.cameras.main.flash(200, 255, 255, 255, false)
    }
    this.emitStats()
  }

  emitStats() {
    const idx = Math.min(this.level, LEVEL_XP.length - 1)
    const curFloor = LEVEL_XP[this.level - 1] ?? 0
    const nextReq = LEVEL_XP[idx] ?? null
    this.onStats({
      level: this.level,
      xp: Math.round(this.xp),
      xpFloor: curFloor,
      xpNext: this.level >= LEVEL_XP.length ? null : nextReq,
      size: Math.round(this.radius),
    })
  }

  update() {
    if (!this.player || !this.player.body) return

    // Bigger = slower, so growth is a real trade-off.
    const speed = BASE_SPEED * (BASE_RADIUS / this.radius) ** 0.35

    let vx = 0
    let vy = 0

    if (this.pointerActive) {
      const p = this.input.activePointer
      const worldPoint = this.cameras.main.getWorldPoint(p.x, p.y)
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, worldPoint.x, worldPoint.y)
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, worldPoint.x, worldPoint.y)
      if (dist > 8) {
        vx = Math.cos(angle) * speed
        vy = Math.sin(angle) * speed
      }
    } else {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx = -speed
      else if (this.cursors.right.isDown || this.keys.D.isDown) vx = speed
      if (this.cursors.up.isDown || this.keys.W.isDown) vy = -speed
      else if (this.cursors.down.isDown || this.keys.S.isDown) vy = speed
    }

    // Don't stomp on knockback velocity while it's still strong.
    const bodySpeed = this.player.body.velocity.length()
    if (!(vx === 0 && vy === 0 && bodySpeed > speed * 1.2)) {
      this.player.body.setVelocity(vx, vy)
    }

    // Keep the eye glued to the creature.
    this.eye.setPosition(this.player.x, this.player.y - this.radius * 0.25)

    // Enemy AI: chase if you're smaller/tasty & close, else wander.
    this.enemies.children.iterate((enemy) => {
      if (!enemy || !enemy.body) return true
      const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y)
      const eSpeed = 70 + enemy.radius * 2
      if (d < 320 && enemy.radius >= this.radius) {
        // Predator: chase.
        const a = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y)
        enemy.body.setVelocity(Math.cos(a) * eSpeed, Math.sin(a) * eSpeed)
      } else if (d < 260 && enemy.radius < this.radius) {
        // Prey: flee.
        const a = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y)
        enemy.body.setVelocity(Math.cos(a) * eSpeed, Math.sin(a) * eSpeed)
      } else {
        // Wander.
        enemy.wanderAngle += Phaser.Math.FloatBetween(-0.1, 0.1)
        enemy.body.setVelocity(Math.cos(enemy.wanderAngle) * eSpeed * 0.5, Math.sin(enemy.wanderAngle) * eSpeed * 0.5)
      }
      // Bounce off world edges by flipping wander direction.
      if (enemy.x <= 40 || enemy.x >= WORLD.width - 40 || enemy.y <= 40 || enemy.y >= WORLD.height - 40) {
        enemy.wanderAngle += Math.PI
      }
      return true
    })
  }
}
