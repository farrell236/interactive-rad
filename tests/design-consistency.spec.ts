import { expect, test, type Page } from '@playwright/test'

async function expectNoDocumentOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(1)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Interactive Radiology' })).toBeVisible()
})

test('landing scenes drive the active module highlight and tabs open lessons directly', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Open Interactive Radiology home' })).toHaveAttribute('aria-current', 'page')
  const xrayScene = page.locator('#landing-xray')
  await xrayScene.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await expect(page.getByRole('tab', { name: 'X-ray', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expectNoDocumentOverflow(page)

  await page.getByRole('tab', { name: 'CT', exact: true }).click()
  await expect(page.locator('#panel-ct')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'From projections to a volume.' })).toBeVisible()

  await page.getByRole('button', { name: 'Open Interactive Radiology home' }).click()
  await expect(page.getByRole('heading', { name: 'Interactive Radiology' })).toBeVisible()
})

test('all modality shells stay within the viewport', async ({ page }) => {
  for (const modality of ['X-ray', 'CT', 'MRI', 'Image Data', 'CT Windowing']) {
    await page.getByRole('tab', { name: modality, exact: true }).click()
    await expect(page.locator(`#panel-${modality === 'X-ray' ? 'xray' : modality === 'Image Data' ? 'image-data' : modality === 'CT Windowing' ? 'windowing' : modality.toLowerCase()}`)).toBeVisible()
    await expectNoDocumentOverflow(page)
  }
})

test('license and attribution notices remain readable without horizontal overflow', async ({ page }) => {
  await page.getByRole('button', { name: 'Licenses & attributions' }).click()
  await expect(page.getByRole('heading', { name: 'Licenses & attributions' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'AGPL-3.0-or-later' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'CC BY-NC-SA 4.0' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Corresponding source' })).toHaveAttribute('href', 'https://github.com/farrell236/interactive-rad')
  await expectNoDocumentOverflow(page)
})

test('responsive chapter pickers replace dense navigation on narrow screens', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'Narrow-screen behavior')

  await page.getByRole('tab', { name: 'CT', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Select CT chapter' })).toBeVisible()

  await page.getByRole('tab', { name: 'MRI' }).click()
  await expect(page.getByRole('combobox', { name: 'Select MRI chapter' })).toBeVisible()

  await page.getByRole('tab', { name: 'Image Data' }).click()
  await expect(page.getByRole('combobox', { name: 'Select image data chapter' })).toBeVisible()

  await page.getByRole('tab', { name: 'CT Windowing' }).click()
  await expect(page.getByRole('combobox', { name: 'Select CT windowing section' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Windowing learning sections' })).toBeHidden()

  for (let press = 0; press < 3; press += 1) await page.getByRole('button', { name: 'Increase text size' }).click()
  await expect(page.locator('html')).toHaveCSS('font-size', '22px')
  await expectNoDocumentOverflow(page)
})

test('custom MRI weighting tabs support standard arrow-key navigation', async ({ page }) => {
  await page.getByRole('tab', { name: 'MRI' }).click()
  if ((page.viewportSize()?.width ?? 1280) <= 900) await page.getByRole('combobox', { name: 'Select MRI chapter' }).selectOption('1')
  else await page.getByRole('button', { name: /Relaxation & weighting/ }).click()
  const predefined = page.getByRole('tab', { name: 'Predefined' })
  const custom = page.getByRole('tab', { name: 'Custom' })
  await predefined.focus()
  await predefined.press('ArrowRight')
  await expect(custom).toBeFocused()
  await expect(custom).toHaveAttribute('aria-selected', 'true')
})

test('image geometry stages support standard arrow-key navigation', async ({ page }) => {
  await page.getByRole('tab', { name: 'Image Data' }).click()
  if ((page.viewportSize()?.width ?? 1280) <= 900) await page.getByRole('combobox', { name: 'Select image data chapter' }).selectOption('6')
  else await page.getByRole('navigation', { name: 'Image data chapters' }).getByRole('button', { name: /Geometry together/ }).click()
  const stages = page.getByRole('tablist', { name: 'Geometry animation stages' })
  const tabs = stages.getByRole('tab')
  await tabs.first().focus()
  await tabs.first().press('End')
  await expect(tabs.last()).toBeFocused()
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
})

test('light and dark appearances retain readable page geometry', async ({ page }) => {
  const themeButton = page.getByRole('button', { name: /Switch to .* appearance/ })
  await themeButton.click()
  await expectNoDocumentOverflow(page)
  await themeButton.click()
  await expectNoDocumentOverflow(page)
})
