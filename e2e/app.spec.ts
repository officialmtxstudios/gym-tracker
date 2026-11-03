import { expect, test, type Page } from '@playwright/test'
import { historyBackup } from './fixture'

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/shots/${name}.png`, fullPage: true })
const card = (page: Page, name: string) => page.locator('section.entry').filter({ has: page.getByRole('heading', { name, exact: true }) })

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
})

async function importHistory(page: Page) {
  await page.goto('/#/settings')
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(historyBackup())),
  })
  await expect(page.getByText('Restored 24 workouts')).toBeVisible()
}

test('first workouts from scratch: Upper A then Lower A', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Upper A' })).toBeVisible()
  await page.getByRole('button', { name: 'Start Upper A' }).click()

  await page.getByLabel('Bodyweight', { exact: true }).fill('181')
  const weights: Record<string, string> = {
    'Weighted pull-up': '25',
    'Flat bench press': '205',
    'Barbell row': '165',
    'Overhead press': '115',
    'Weighted dip': '45',
  }
  for (const [name, w] of Object.entries(weights)) {
    const c = card(page, name)
    await c.getByLabel('Set 1 weight', { exact: true }).fill(w)
    const ticks = c.getByRole('button', { name: /^Set \d+ done$/ })
    for (let i = 0; i < (await ticks.count()); i++) await ticks.nth(i).click()
  }
  // Weight typed in set 1 carried to the other sets
  await expect(card(page, 'Flat bench press').getByLabel('Set 4 weight', { exact: true })).toHaveValue('205')
  // Rest timer started
  await expect(page.getByRole('timer')).toContainText('Rest')
  // Effort rating cycles · → 0 → 1
  const rir = card(page, 'Flat bench press').getByLabel('Set 1 RIR')
  await rir.click()
  await rir.click()
  await expect(rir).toHaveText('1')
  await shot(page, '01-workout-upper-a')

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByRole('dialog', { name: 'Workout saved' })).toContainText('16 working sets')
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()

  await expect(page.getByText('1 / 4 sessions')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Lower A' })).toBeVisible()
  await page.getByRole('button', { name: 'Start Lower A' }).click()

  // Sled first, with stopwatch
  const sledCard = card(page, 'Sled push/pull')
  await sledCard.getByLabel('Sled weight', { exact: true }).fill('90')
  await sledCard.getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(1300)
  await sledCard.getByRole('button', { name: 'Stop' }).click()
  await expect(sledCard.getByLabel('Total time')).toHaveValue('0:01')

  // Swap standing → seated calf raise from the exercise menu
  await card(page, 'Standing calf raise').getByRole('button', { name: /Standing calf raise/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Seated calf raise' }).click()
  await expect(card(page, 'Seated calf raise')).toBeVisible()

  const squat = card(page, 'Back squat')
  await squat.getByLabel('Set 1 weight', { exact: true }).fill('275')
  for (let i = 1; i <= 4; i++) await squat.getByLabel(`Set ${i} done`).click()
  await shot(page, '02-workout-lower-a')
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()

  await expect(page.getByText('2 / 4 sessions')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Upper B' })).toBeVisible()
  await expect(page.locator('.row-btn.lift', { hasText: 'Back squat' })).toContainText('312 lb') // 275 × 4 reps
  await shot(page, '03-home-after-two')

  // Upper B: swap incline DB → incline barbell
  await page.getByRole('button', { name: 'Start Upper B' }).click()
  await card(page, 'Incline DB press').getByRole('button', { name: /Incline DB press/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Incline barbell press' }).click()
  const incline = card(page, 'Incline barbell press')
  await incline.getByLabel('Set 1 weight', { exact: true }).fill('155')
  await incline.getByLabel('Set 1 done').click()
  await card(page, 'Overhead press').getByLabel('Set 1 weight', { exact: true }).fill('125')
  await card(page, 'Overhead press').getByLabel('Set 1 done').click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()

  // Lower B: sumo instead of conventional; optional hip thrust starts skipped
  await page.getByRole('button', { name: 'Start Lower B' }).click()
  await expect(page.locator('section.skipped', { hasText: 'Barbell hip thrust' })).toBeVisible()
  await page.locator('section.skipped', { hasText: 'Barbell hip thrust' }).getByRole('button', { name: 'Add to today' }).click()
  await card(page, 'Barbell hip thrust').getByLabel('Set 1 weight', { exact: true }).fill('225')
  await card(page, 'Barbell hip thrust').getByLabel('Set 1 done').click()
  await card(page, 'Deadlift').getByRole('button', { name: /Deadlift/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sumo deadlift' }).click()
  await card(page, 'Sumo deadlift').getByLabel('Set 1 weight', { exact: true }).fill('365')
  await card(page, 'Sumo deadlift').getByLabel('Set 1 done').click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()

  // Full rotation done → back to Upper A, 4 of 4 this week
  await expect(page.getByText('4 / 4 sessions')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Upper A' })).toBeVisible()
  await page.getByRole('link', { name: /This week/ }).click()
  await expect(page.locator('.cal-day.today .tag')).toHaveCount(4)

  // Edit a past session from the calendar
  await page.getByRole('button', { name: /Lower B/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Lower B' })).toBeVisible()
  await card(page, 'Sumo deadlift').getByLabel('Set 2 done').click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
})

test('with 6 weeks of history: stall flag, suggestions, charts, calendar', async ({ page }) => {
  await importHistory(page)
  await page.goto('/')
  const stalled = page.getByRole('button', { name: /Stalled: Flat bench press \(3 wks\)/ })
  await expect(stalled).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Upper A' })).toBeVisible()
  await shot(page, '04-home-history')

  await stalled.click()
  await expect(page.getByText('Stalled – no new best in 3 weeks')).toBeVisible()
  await expect(page.locator('.chart canvas')).toBeVisible()
  await shot(page, '05-progress-bench')
  await page.getByRole('button', { name: 'Volume' }).click()
  await expect(page.locator('.chart canvas')).toBeVisible()

  await page.goto('/#/progress/sled')
  await page.getByRole('button', { name: 'Time', exact: true }).click()
  await expect(page.locator('.chart canvas')).toBeVisible()
  await shot(page, '06-progress-sled')

  // Suggestions: bench missed the top last time → same weight, one more rep
  await page.goto('/')
  await page.getByRole('button', { name: 'Start Upper A' }).click()
  const bench = card(page, 'Flat bench press')
  await expect(bench.getByLabel('Set 1 weight', { exact: true })).toHaveValue('200')
  await expect(bench.getByLabel('Set 1 reps', { exact: true })).toHaveValue('6')
  await expect(bench).toContainText('Same weight — aim for one more rep')
  await expect(bench).toContainText('200 × 5, 5, 5, 5')
  // Pull-ups hit 8,8,8 → +5 lb added
  await expect(card(page, 'Weighted pull-up').getByLabel('Set 1 weight', { exact: true })).toHaveValue('50')
  await expect(page.getByLabel('Bodyweight', { exact: true })).not.toHaveValue('')
  await page.getByRole('button', { name: 'Discard workout' }).click()

  // Squat hit 6s on every set → +10 lb
  await page.getByRole('button', { name: 'Do a different session' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Lower A' }).click()
  await expect(card(page, 'Back squat').getByLabel('Set 1 weight', { exact: true })).toHaveValue('285')
  await expect(card(page, 'Back squat')).toContainText('+10 lb')
  await page.getByRole('button', { name: 'Discard workout' }).click()
  await expect(page.getByRole('button', { name: 'Start Upper A' })).toBeVisible()

  await page.goto('/#/calendar')
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(page.locator('.tag.upper').first()).toBeVisible()
  await shot(page, '07-calendar')
})

test('everything in the plan can be edited in the app', async ({ page }) => {
  await page.goto('/#/plan')
  await page.getByRole('button', { name: /^Upper B/ }).click()
  await page.getByLabel('Name').fill('Upper B (press)')
  await page.getByRole('button', { name: '+ Add exercise' }).click()
  await page.getByPlaceholder('Search or type a new name').fill('hip')
  await page.getByRole('dialog').getByRole('button', { name: /Barbell hip thrust/ }).click()
  await expect(page.getByRole('heading', { name: '6. Barbell hip thrust' })).toBeVisible()
  // Add a swap to the first exercise and make it the default
  await page.locator('section.slot').first().getByRole('button', { name: '+ Add swap' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Weighted dip/ }).click()
  await page.locator('section.slot').first().getByRole('button', { name: 'Weighted dip', exact: true }).click()
  await expect(page.getByRole('heading', { name: '1. Weighted dip' })).toBeVisible()
  // Reorder, change sets and reps
  await page.locator('section.slot').first().getByLabel('Move down').click()
  await expect(page.getByRole('heading', { name: '2. Weighted dip' })).toBeVisible()
  await page.locator('section.slot').first().getByLabel('Sets plus').click()
  await expect(page.locator('section.slot').first().getByLabel('Sets', { exact: true })).toHaveValue('5')
  await shot(page, '08-edit-session')
  await page.getByRole('button', { name: '‹ Plan' }).click()
  await expect(page.getByRole('button', { name: /^Upper B \(press\)/ })).toBeVisible()

  // New session in the rotation
  await page.getByRole('button', { name: '+ New session' }).click()
  await page.getByLabel('Name').fill('Upper C')
  await page.getByText('Part of the rotation').click()
  await page.getByRole('button', { name: '‹ Plan' }).click()
  await expect(page.getByRole('button', { name: /^Upper C/ })).toContainText('#5 in rotation')
  await shot(page, '09-plan')

  // New exercise in the library
  await page.getByRole('button', { name: /Exercise library/ }).click()
  await page.getByRole('button', { name: '+ New exercise' }).click()
  await page.getByLabel('Name').fill('Farmer carry')
  await page.getByLabel('Weight jump plus').click()
  await page.getByRole('button', { name: '‹ Exercises' }).click()
  await expect(page.getByRole('button', { name: /Farmer carry/ })).toContainText('+7.5 lb')

  // Quick-create an exercise mid-workout
  await page.goto('/')
  await page.getByRole('button', { name: 'Do a different session' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Empty workout/ }).click()
  await page.getByRole('button', { name: '+ Add exercise' }).click()
  await page.getByPlaceholder('Search or type a new name').fill('Landmine press')
  await page.getByRole('button', { name: /Create “Landmine press”/ }).click()
  await expect(card(page, 'Landmine press')).toBeVisible()
})

test('backup, spreadsheet export and settings', async ({ page }) => {
  // The automated browser can't use the iPhone share sheet, so test the download path.
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined }))
  await importHistory(page)
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export spreadsheet (CSV)' }).click(),
  ])
  expect(csv.suggestedFilename()).toMatch(/^gym-tracker-sets-.*\.csv$/)
  const text = await (await csv.createReadStream()).toArray().then((c) => Buffer.concat(c).toString())
  expect(text.split('\n')[0]).toContain('date,session,deload,bodyweight,exercise')
  expect(text).toContain('Flat bench press')

  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Back up (full file)' }).click(),
  ])
  expect(backup.suggestedFilename()).toMatch(/\.json$/)
  await expect(page.getByText('Last backup: today')).toBeVisible()

  await page.getByLabel('Main lift rest plus').click()
  await expect(page.getByLabel('Main lift rest', { exact: true })).toHaveValue('195')
  await shot(page, '10-settings')
})
