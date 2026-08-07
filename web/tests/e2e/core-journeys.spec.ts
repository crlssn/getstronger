import { expect, logIn, test } from './fixtures'

test('redirects protected routes to login', async ({ page }) => {
  await page.goto('/profile')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Log in to GetStronger' })).toBeVisible()
})

test.describe('authenticated journeys', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('navigates between the primary app sections', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Primary navigation' })

    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()

    await navigation.getByRole('link', { name: 'Workout' }).click()
    await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible()

    await navigation.getByRole('link', { name: 'Training' }).click()
    await expect(page.getByRole('heading', { name: 'Training', exact: true })).toBeVisible()

    await navigation.getByRole('link', { name: 'Exercises' }).click()
    await expect(page.getByRole('heading', { name: 'Exercises', exact: true })).toBeVisible()

    await navigation.getByRole('link', { name: 'Me', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'John Doe' })).toBeVisible()
  })

  test('creates, updates, and deletes a tagged exercise', async ({ page }) => {
    const exerciseName = 'E2E Cable Row'
    const updatedName = 'E2E Seated Cable Row'

    await page.goto('/exercises')
    await page.getByRole('link', { name: 'New exercise' }).click()
    await page.locator('form input[type="text"]').first().fill(exerciseName)

    const tagInput = page.getByLabel('Add exercise tag')
    await tagInput.fill('Upper body')
    await tagInput.press('Enter')
    await tagInput.fill('Pull')
    await tagInput.press('Enter')
    await page.getByRole('button', { name: 'Save Exercise' }).click()

    await expect(page).toHaveURL(/\/exercises$/)
    await page.getByLabel('Search exercises').fill(exerciseName)
    await page.getByRole('link', { name: new RegExp(exerciseName) }).click()
    await expect(page.getByText('Upper body', { exact: true })).toBeVisible()
    await expect(page.getByText('Pull', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: /Update exercise/ }).click()
    await page.locator('form input[type="text"]').first().fill(updatedName)
    await page.getByRole('button', { name: 'Update Exercise' }).click()
    await expect(page.getByText(updatedName, { exact: true })).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete exercise' }).click()
    await expect(page).toHaveURL(/\/exercises$/)
    await expect(page.getByText('Exercise deleted')).toBeVisible()
  })

  test('completes a quick workout and opens its summary', async ({ page }) => {
    await page.goto('/workouts/quick')
    await page.getByRole('button', { name: 'Choose exercise' }).click()

    const picker = page.getByRole('dialog', { name: 'Add an exercise' })
    const firstExercise = picker.locator('.exercise-options button').first()
    const exerciseName = (await firstExercise.locator('strong').innerText()).trim()
    await firstExercise.click()

    await page.getByLabel(`${exerciseName} set 1 weight`).fill('25')
    await page.getByLabel(`${exerciseName} set 1 repetitions`).fill('8')
    await page.getByLabel('Workout note').fill('Completed by the E2E suite.')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await page.getByRole('button', { name: 'Finish workout' }).click()

    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByText('Completed workout', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Quick Workout', exact: true })).toBeVisible()
    await expect(page.getByText('Completed by the E2E suite.')).toBeVisible()
    await expect(page.getByText(exerciseName, { exact: true })).toBeVisible()
  })

  test('shows social profile tabs and follow state', async ({ page }) => {
    await page.goto('/home')
    await page.getByRole('link', { name: 'Jane Doe', exact: true }).first().click()

    await expect(page.getByRole('button', { name: 'Unfollow Jane' })).toBeVisible()
    const profileTabs = page.getByRole('navigation', { name: 'Profile sections' })
    await expect(profileTabs.getByRole('link', { name: 'Workouts' })).toBeVisible()
    await expect(profileTabs.getByRole('link', { name: 'Personal Bests' })).toBeVisible()
    await expect(profileTabs.getByRole('link', { name: 'Follows', exact: true })).toBeVisible()
    await expect(profileTabs.getByRole('link', { name: 'Followers' })).toBeVisible()
  })
})
