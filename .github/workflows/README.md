# GitHub Actions CI/CD Workflows

This project uses GitHub Actions for continuous integration and deployment. All workflows are free for public repositories, and private repositories get 2,000 free minutes per month.

## Workflows

### 1. Backend CI (`backend-ci.yml`)
**Triggers:** Push or PR to main/master/develop that affects backend files

**What it does:**
- Sets up .NET 10
- Restores dependencies
- Builds the backend in Release mode
- Runs tests (if any exist)
- Checks for security vulnerabilities in packages

**Status:** [![Backend CI](https://github.com/jeremywho/flashpad/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/jeremywho/flashpad/actions/workflows/backend-ci.yml)

### 2. Electron CI (`electron-ci.yml`)
**Triggers:** Push or PR to main/master/develop that affects Electron or shared files

**What it does:**
- Runs on Ubuntu, macOS, and Windows
- Builds the shared package
- Installs Electron dependencies
- Checks TypeScript compilation
- Builds the Electron app for all platforms
- Uploads build artifacts

**Status:** [![Electron CI](https://github.com/jeremywho/flashpad/actions/workflows/electron-ci.yml/badge.svg)](https://github.com/jeremywho/flashpad/actions/workflows/electron-ci.yml)

### 3. Mobile CI (`mobile-ci.yml`)
**Triggers:** Push or PR to main/master/develop that affects mobile or shared files

**What it does:**
- **Lint & Test Job:**
  - Lints the code
  - Checks TypeScript compilation
  - Runs Jest tests

- **Android Build Job:**
  - Sets up Java 17
  - Builds Android debug APK
  - Uploads APK artifact

- **iOS Build Job:**
  - Runs on macOS
  - Installs CocoaPods
  - Builds iOS app for simulator

**Status:** [![Mobile CI](https://github.com/jeremywho/flashpad/actions/workflows/mobile-ci.yml/badge.svg)](https://github.com/jeremywho/flashpad/actions/workflows/mobile-ci.yml)

### 4. Code Quality (`code-quality.yml`)
**Triggers:**
- Push or PR to main/master/develop
- Weekly on Mondays at 9am UTC
- Manual trigger

**What it does:**
- Reviews dependencies in PRs
- Runs npm audit on all packages
- Checks for .NET vulnerabilities
- Validates TypeScript compilation across all packages

**Status:** [![Code Quality](https://github.com/jeremywho/flashpad/actions/workflows/code-quality.yml/badge.svg)](https://github.com/jeremywho/flashpad/actions/workflows/code-quality.yml)

### 5. Release (`release.yml`)
**Triggers:** When you push a tag matching `v*.*.*` (e.g., `v1.0.0`)

**What it does:**
- Creates a GitHub Release
- Builds Electron app for Linux, macOS, and Windows
- Uploads platform-specific installers to the release
- Enables auto-updates for Electron app

## Creating a Release

To create a new release with auto-update support:

```bash
# Tag the current commit
git tag v1.0.0

# Push the tag to GitHub
git push origin v1.0.0
```

This will automatically:
1. Trigger the release workflow
2. Build installers for all platforms
3. Create a GitHub release
4. Upload installers to the release
5. Users with the app installed will get auto-update notifications

## Viewing Workflow Results

1. Go to your repository on GitHub
2. Click the "Actions" tab
3. Select a workflow from the left sidebar
4. Click on a specific run to see details

## Download Build Artifacts

After workflows run, you can download build artifacts:

1. Go to Actions tab
2. Click on a completed workflow run
3. Scroll to "Artifacts" section
4. Download the artifact you need

Artifacts are kept for 7 days by default.

## Adding Tests

### Backend Tests
Create test files in `packages/backend` and they'll run automatically:

```bash
cd packages/backend
dotnet new xunit -n Backend.Tests
```

### Mobile Tests
The React Native project already has Jest configured. Add tests in `packages/mobile/__tests__/`:

```typescript
// packages/mobile/__tests__/Login.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import LoginScreen from '../src/screens/LoginScreen';

test('renders login screen', () => {
  const { getByText } = render(<LoginScreen />);
  expect(getByText('Login')).toBeTruthy();
});
```

## Customizing Workflows

### Change Build Triggers
Edit the `on:` section in any workflow file:

```yaml
on:
  push:
    branches: [ master, main, develop, staging ]
  pull_request:
    branches: [ master, main ]
```

### Add Environment Variables
Add secrets in GitHub Settings > Secrets and variables > Actions:

```yaml
- name: Build with custom config
  env:
    API_KEY: ${{ secrets.API_KEY }}
  run: npm run build
```

### Notifications
Add Slack/Discord notifications:

```yaml
- name: Notify on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## Free Tier Limits

### GitHub Actions Free Tier (Private Repos)
- **Minutes per month:** 2,000
- **Storage:** 500 MB
- **Concurrent jobs:** Varies by plan

### Tips to Save Minutes
1. Only run workflows on necessary paths (already configured)
2. Use `continue-on-error: true` for non-critical checks
3. Cache dependencies (already implemented)
4. Use matrix builds only when needed

## Monitoring Usage

Check your usage:
1. Go to Settings > Billing > Plans and usage
2. Click "Get usage report"
3. View minutes used per workflow

## Status Badges

Add workflow status badges to your README:

```markdown
[![Backend CI](https://github.com/jeremywho/flashpad/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/jeremywho/flashpad/actions/workflows/backend-ci.yml)
```

## Troubleshooting

### Workflow not running?
- Check that the file paths in triggers match your changes
- Ensure branch names match (master vs main)
- Check Actions tab for disabled workflows

### Build failing?
- Check the workflow logs in Actions tab
- Look for red X next to failed steps
- Common issues:
  - Missing dependencies
  - TypeScript errors
  - Test failures

### Need help?
- Check [GitHub Actions documentation](https://docs.github.com/en/actions)
- Review workflow logs for specific errors
- Check individual package README files for build requirements
