import { mockDeep } from 'vitest-mock-extended';
import { GitRefsDatasource } from '../../../../modules/datasource/git-refs';
import * as _batectWrapper from '../../../../modules/manager/batect-wrapper';
import * as _bundler from '../../../../modules/manager/bundler';
import * as _composer from '../../../../modules/manager/composer';
import * as _gitSubmodules from '../../../../modules/manager/git-submodules';
import * as _gomod from '../../../../modules/manager/gomod';
import * as _helmv3 from '../../../../modules/manager/helmv3';
import * as _npm from '../../../../modules/manager/npm';
import * as _pep621 from '../../../../modules/manager/pep621';
import * as _pipCompile from '../../../../modules/manager/pip-compile';
import * as _poetry from '../../../../modules/manager/poetry';
import type { PackageFile } from '../../../../modules/manager/types';
import type { BranchConfig, BranchUpgradeConfig } from '../../../types';
import * as _autoReplace from './auto-replace';
import { getUpdatedPackageFiles } from './get-updated';
import { git } from '~test/util';

const bundler = vi.mocked(_bundler);
const composer = vi.mocked(_composer);
const gitSubmodules = vi.mocked(_gitSubmodules);
const gomod = vi.mocked(_gomod);
const helmv3 = vi.mocked(_helmv3);
const npm = vi.mocked(_npm);
const batectWrapper = vi.mocked(_batectWrapper);
const autoReplace = vi.mocked(_autoReplace);
const pep621 = vi.mocked(_pep621);
const pipCompile = vi.mocked(_pipCompile);
const poetry = vi.mocked(_poetry);

vi.mock('../../../../modules/manager/bundler');
vi.mock('../../../../modules/manager/composer');
vi.mock('../../../../modules/manager/helmv3');
vi.mock('../../../../modules/manager/npm');
vi.mock('../../../../modules/manager/git-submodules');
vi.mock('../../../../modules/manager/gomod', () => mockDeep());
vi.mock('../../../../modules/manager/batect-wrapper');
vi.mock('../../../../modules/manager/pep621');
vi.mock('../../../../modules/manager/pip-compile');
vi.mock('../../../../modules/manager/poetry');
vi.mock('./auto-replace');

describe('workers/repository/update/branch/get-updated', () => {
  describe('getUpdatedPackageFiles()', () => {
    let config: BranchConfig;

    beforeEach(() => {
      config = {
        baseBranch: 'base-branch',
        manager: 'some-manager',
        branchName: 'renovate/pin',
        upgrades: [],
      } satisfies BranchConfig;
      npm.updateDependency = vi.fn();
      git.getFile.mockResolvedValueOnce('existing content');
    });

    it('handles autoreplace base updated', async () => {
      config.upgrades.push({
        packageFile: 'index.html',
        manager: 'html',
        branchName: '',
      });
      autoReplace.doAutoReplace.mockResolvedValueOnce('updated-file');
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedPackageFiles: [
          { type: 'addition', path: 'index.html', contents: 'updated-file' },
        ],
      });
    });

    it('handles autoreplace branch no update', async () => {
      config.upgrades.push({
        packageFile: 'index.html',
        manager: 'html',
        branchName: '',
      });
      autoReplace.doAutoReplace.mockResolvedValueOnce('existing content');
      const res = await getUpdatedPackageFiles(config);
      expect(res).toEqual({
        artifactErrors: [],
        reuseExistingBranch: undefined,
        updatedArtifacts: [],
        updatedPackageFiles: [],
        artifactNotices: [],
      });
    });

    it('handles autoreplace failure', async () => {
      config.upgrades.push({ manager: 'html', branchName: '' });
      autoReplace.doAutoReplace.mockResolvedValueOnce(null);
      await expect(getUpdatedPackageFiles(config)).rejects.toThrow();
    });

    it('handles autoreplace branch needs update', async () => {
      config.reuseExistingBranch = true;
      config.upgrades.push({
        packageFile: 'index.html',
        manager: 'html',
        branchName: '',
      });
      autoReplace.doAutoReplace.mockResolvedValueOnce(null);
      autoReplace.doAutoReplace.mockResolvedValueOnce('updated-file');
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedPackageFiles: [
          { type: 'addition', path: 'index.html', contents: 'updated-file' },
        ],
      });
    });

    it('handles empty', async () => {
      const res = await getUpdatedPackageFiles(config);
      expect(res).toEqual({
        artifactErrors: [],
        reuseExistingBranch: undefined,
        updatedArtifacts: [],
        updatedPackageFiles: [],
        artifactNotices: [],
      });
    });

    it('handles null content', async () => {
      config.reuseExistingBranch = true;
      config.upgrades.push({
        manager: 'npm',
        branchName: 'some-branch',
      } satisfies BranchUpgradeConfig);
      await expect(getUpdatedPackageFiles(config)).rejects.toThrow();
    });

    it('handles content change', async () => {
      config.reuseExistingBranch = true;
      config.upgrades.push({
        packageFile: 'package.json',
        manager: 'npm',
        branchName: 'some-branch',
      } satisfies BranchUpgradeConfig);
      npm.updateDependency.mockReturnValue('some new content');
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedPackageFiles: [
          {
            type: 'addition',
            path: 'package.json',
            contents: 'some new content',
          },
        ],
      });
    });

    it('handles lock files', async () => {
      config.reuseExistingBranch = true;
      config.upgrades.push({
        packageFile: 'composer.json',
        manager: 'composer',
        branchName: '',
      });
      autoReplace.doAutoReplace.mockResolvedValueOnce('some new content');
      composer.updateArtifacts.mockResolvedValueOnce([
        {
          file: {
            type: 'addition',
            path: 'composer.json',
            contents: 'some contents',
          },
        },
      ]);
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedArtifacts: [
          {
            type: 'addition',
            path: 'composer.json',
            contents: 'some contents',
          },
        ],
        updatedPackageFiles: [
          {
            type: 'addition',
            path: 'composer.json',
            contents: 'some new content',
          },
        ],
      });
    });

    it('handles artifact notices', async () => {
      config.reuseExistingBranch = true;
      config.upgrades.push({
        packageFile: 'go.mod',
        manager: 'gomod',
        branchName: 'foo/bar',
      });
      gomod.updateDependency.mockReturnValue('some new content');
      gomod.updateArtifacts.mockResolvedValueOnce([
        {
          file: {
            type: 'addition',
            path: 'go.mod',
            contents: 'some content',
          },
          notice: {
            file: 'go.mod',
            message: 'some notice',
          },
        },
      ]);
      const res = await getUpdatedPackageFiles(config);
      expect(res).toEqual({
        artifactErrors: [],
        artifactNotices: [
          {
            file: 'go.mod',
            message: 'some notice',
          },
        ],
        reuseExistingBranch: false,
        updatedArtifacts: [
          {
            contents: 'some content',
            path: 'go.mod',
            type: 'addition',
          },
        ],
        updatedPackageFiles: [
          {
            contents: 'some new content',
            path: 'go.mod',
            type: 'addition',
          },
        ],
      });
    });

    it('handles lockFileMaintenance', async () => {
      config.upgrades.push({
        manager: 'composer',
        updateType: 'lockFileMaintenance',
        branchName: 'some-branch',
      } satisfies BranchUpgradeConfig);
      composer.updateArtifacts.mockResolvedValueOnce([
        {
          file: {
            type: 'addition',
            path: 'composer.json',
            contents: 'some contents',
          },
        },
      ]);
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedArtifacts: [
          {
            type: 'addition',
            path: 'composer.json',
            contents: 'some contents',
          },
        ],
      });
    });

    it('for updatedArtifacts passes proper lockFiles', async () => {
      config.upgrades.push({
        packageFile: 'composer.json',
        manager: 'composer',
        branchName: '',
      });
      config.lockFiles = ['different.lock'];
      config.packageFiles = {
        composer: [
          {
            packageFile: 'composer.json',
            lockFiles: ['composer.lock'],
            deps: [],
          },
        ] satisfies PackageFile[],
      };
      autoReplace.doAutoReplace.mockResolvedValueOnce('some new content');
      composer.updateArtifacts.mockResolvedValueOnce([
        {
          file: {
            type: 'addition',
            path: 'composer.lock',
            contents: 'some contents',
          },
        },
      ]);
      await getUpdatedPackageFiles(config);
      expect(composer.updateArtifacts).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            lockFiles: ['composer.lock'],
          }),
        }),
      );
    });

    it('for nonUpdatedArtifacts passes proper lockFiles', async () => {
      config.upgrades.push({
        packageFile: 'composer.json',
        manager: 'composer',
        branchName: '',
        isLockfileUpdate: true,
      });
      composer.updateLockedDependency.mockReturnValueOnce({
        status: 'unsupported',
      });
      config.lockFiles = ['different.lock'];
      config.packageFiles = {
        composer: [
          {
            packageFile: 'composer.json',
            lockFiles: ['composer.lock'],
            deps: [],
          },
        ] satisfies PackageFile[],
      };
      composer.updateArtifacts.mockResolvedValueOnce([
        {
          file: {
            type: 'addition',
            path: 'composer.lock',
            contents: 'some contents',
          },
        },
      ]);
      await getUpdatedPackageFiles(config);
      expect(composer.updateArtifacts).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            lockFiles: ['composer.lock'],
          }),
        }),
      );
    });

    it('for lockFileMaintenance passes proper lockFiles', async () => {
      config.upgrades.push({
        manager: 'composer',
        updateType: 'lockFileMaintenance',
        packageFile: 'composer.json',
        branchName: 'some-branch',
      } satisfies BranchUpgradeConfig);
      config.lockFiles = ['different.lock'];
      config.packageFiles = {
        composer: [
          {
            packageFile: 'composer.json',
            lockFiles: ['composer.lock'],
            deps: [],
          },
        ] satisfies PackageFile[],
      };
      composer.updateArtifacts.mockResolvedValueOnce([
        {
          file: {
            type: 'addition',
            path: 'composer.json',
            contents: 'some contents',
          },
        },
      ]);
      await getUpdatedPackageFiles(config);
      expect(composer.updateArtifacts).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            lockFiles: ['composer.lock'],
          }),
        }),
      );
    });

    it('handles isRemediation success', async () => {
      config.upgrades.push({
        manager: 'npm',
        lockFile: 'package-lock.json',
        isRemediation: true,
        branchName: 'some-branch',
      } satisfies BranchUpgradeConfig);
      npm.updateLockedDependency.mockResolvedValueOnce({
        status: 'updated',
        files: { 'package-lock.json': 'new contents' },
      });
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedPackageFiles: [
          {
            type: 'addition',
            path: 'package-lock.json',
            contents: 'new contents',
          },
        ],
      });
    });

    it('handles unsupported isRemediation', async () => {
      config.upgrades.push({
        manager: 'npm',
        lockFile: 'package-lock.json',
        isRemediation: true,
        branchName: 'some-branch',
      } satisfies BranchUpgradeConfig);
      npm.updateLockedDependency.mockResolvedValueOnce({
        status: 'unsupported',
      });
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchInlineSnapshot(`
        {
          "artifactErrors": [],
          "artifactNotices": [],
          "reuseExistingBranch": undefined,
          "updatedArtifacts": [],
          "updatedPackageFiles": [],
        }
      `);
    });

    it('handles isRemediation rebase', async () => {
      config.upgrades.push({
        manager: 'npm',
        isRemediation: true,
        branchName: 'some-branch',
      } satisfies BranchUpgradeConfig);
      config.reuseExistingBranch = true;
      git.getFile.mockResolvedValueOnce('existing content');
      npm.updateLockedDependency.mockResolvedValue({
        status: 'updated',
        files: { 'package-lock.json': 'new contents' },
      });
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedPackageFiles: [
          {
            type: 'addition',
            path: 'package-lock.json',
            contents: 'new contents',
          },
        ],
      });
    });

    it('handles lockFileMaintenance error', async () => {
      config.upgrades.push({
        manager: 'composer',
        updateType: 'lockFileMaintenance',
        branchName: 'some-branch',
      } satisfies BranchUpgradeConfig);
      composer.updateArtifacts.mockResolvedValueOnce([
        {
          artifactError: {
            lockFile: 'composer.lock',
            stderr: 'some error',
          },
        },
      ]);
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        artifactErrors: [{ lockFile: 'composer.lock', stderr: 'some error' }],
      });
    });

    it('handles lock file errors', async () => {
      config.reuseExistingBranch = true;
      config.upgrades.push({
        manager: 'composer',
        packageFile: 'composer.json',
        branchName: '',
      });
      autoReplace.doAutoReplace.mockResolvedValueOnce('some new content');
      composer.updateArtifacts.mockResolvedValueOnce([
        {
          artifactError: {
            lockFile: 'composer.lock',
            stderr: 'some error',
          },
        },
      ]);
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        artifactErrors: [{ lockFile: 'composer.lock', stderr: 'some error' }],
      });
    });

    it('handles git submodules', async () => {
      config.upgrades.push({
        packageFile: '.gitmodules',
        manager: 'git-submodules',
        datasource: GitRefsDatasource.id,
        branchName: 'some-branch',
      } satisfies BranchUpgradeConfig);
      gitSubmodules.updateDependency.mockResolvedValueOnce('existing content');
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedPackageFiles: [
          {
            type: 'addition',
            path: '.gitmodules',
            contents: 'existing content',
          },
        ],
      });
    });

    it('update artifacts on update-lockfile strategy', async () => {
      config.upgrades.push({
        packageFile: 'composer.json',
        manager: 'composer',
        branchName: '',
        isLockfileUpdate: true,
      });
      composer.updateLockedDependency.mockReturnValueOnce({
        status: 'unsupported',
      });
      composer.updateArtifacts.mockResolvedValueOnce([
        {
          file: {
            type: 'addition',
            path: 'composer.lock',
            contents: 'some contents',
          },
        },
      ]);
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedArtifacts: [
          {
            type: 'addition',
            path: 'composer.lock',
            contents: 'some contents',
          },
        ],
        updatedPackageFiles: [
          {
            type: 'addition',
            path: 'composer.json',
            contents: 'existing content',
          },
        ],
      });
    });

    it('update artifacts on update-lockfile strategy with no updateLockedDependency', async () => {
      config.upgrades.push({
        packageFile: 'abc.tf',
        manager: 'batect-wrapper',
        branchName: '',
        isLockfileUpdate: true,
      });
      batectWrapper.updateArtifacts.mockResolvedValueOnce([
        {
          file: {
            type: 'addition',
            path: 'terraform.lock',
            contents: 'some contents',
          },
        },
      ]);
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedArtifacts: [
          {
            type: 'addition',
            path: 'terraform.lock',
            contents: 'some contents',
          },
        ],
        updatedPackageFiles: [
          {
            type: 'addition',
            path: 'abc.tf',
            contents: 'existing content',
          },
        ],
      });
    });

    it('attempts updateLockedDependency and handles unsupported', async () => {
      config.upgrades.push({
        packageFile: 'package.json',
        lockFiles: ['package-lock.json'],
        manager: 'npm',
        branchName: '',
        isLockfileUpdate: true,
      });
      npm.updateLockedDependency.mockResolvedValue({
        status: 'unsupported',
      });
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchInlineSnapshot(`
        {
          "artifactErrors": [],
          "artifactNotices": [],
          "reuseExistingBranch": undefined,
          "updatedArtifacts": [],
          "updatedPackageFiles": [],
        }
      `);
    });

    it('attempts updateLockedDependency and handles already-updated', async () => {
      config.reuseExistingBranch = true;
      config.upgrades.push({
        packageFile: 'package.json',
        lockFile: 'package-lock.json',
        manager: 'npm',
        branchName: '',
        isLockfileUpdate: true,
      });
      npm.updateLockedDependency.mockResolvedValueOnce({
        status: 'already-updated',
      });
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchInlineSnapshot(`
        {
          "artifactErrors": [],
          "artifactNotices": [],
          "reuseExistingBranch": false,
          "updatedArtifacts": [],
          "updatedPackageFiles": [],
        }
      `);
    });

    it('attempts updateLockedDependency and handles updated files with reuse branch', async () => {
      config.reuseExistingBranch = true;
      config.upgrades.push({
        packageFile: 'package.json',
        lockFile: 'package-lock.json',
        manager: 'npm',
        branchName: '',
        isLockfileUpdate: true,
      });
      git.getFile.mockResolvedValue('some content');
      npm.updateLockedDependency.mockResolvedValue({
        status: 'updated',
        files: {},
      });
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchInlineSnapshot(`
        {
          "artifactErrors": [],
          "artifactNotices": [],
          "reuseExistingBranch": false,
          "updatedArtifacts": [],
          "updatedPackageFiles": [],
        }
      `);
    });

    it('bumps versions in updateDependency managers', async () => {
      config.upgrades.push({
        packageFile: 'package.json',
        branchName: '',
        bumpVersion: 'patch',
        manager: 'npm',
        packageFileVersion: 'old version',
      });
      npm.updateDependency.mockReturnValue('old version');
      npm.bumpPackageVersion.mockReturnValue({ bumpedContent: 'new version' });
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedPackageFiles: [
          {
            type: 'addition',
            path: 'package.json',
            contents: 'new version',
          },
        ],
      });
    });

    it('bumps versions in autoReplace managers', async () => {
      config.upgrades.push({
        packageFile: 'Chart.yaml',
        branchName: '',
        bumpVersion: 'patch',
        manager: 'helmv3',
        packageFileVersion: '0.0.1',
      });
      autoReplace.doAutoReplace.mockResolvedValueOnce('version: 0.0.1');
      helmv3.bumpPackageVersion.mockReturnValue({
        bumpedContent: 'version: 0.0.2',
      });
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchSnapshot({
        updatedPackageFiles: [
          {
            type: 'addition',
            path: 'Chart.yaml',
            contents: 'version: 0.0.2',
          },
        ],
      });
    });

    it('handles replacement', async () => {
      config.upgrades.push({
        packageFile: 'index.html',
        manager: 'html',
        updateType: 'replacement',
        branchName: undefined!,
      });
      autoReplace.doAutoReplace.mockResolvedValueOnce('my-new-dep:1.0.0');
      const res = await getUpdatedPackageFiles(config);
      expect(res).toMatchObject({
        updatedPackageFiles: [
          { path: 'index.html', contents: 'my-new-dep:1.0.0' },
        ],
      });
    });

    it('handles package files updated by multiple managers', async () => {
      config.upgrades.push({
        packageFile: 'pyproject.toml',
        manager: 'poetry',
        branchName: '',
      });
      config.upgrades.push({
        packageFile: 'pyproject.toml',
        manager: 'pep621',
        branchName: '',
      });
      autoReplace.doAutoReplace.mockResolvedValueOnce('my-new-dep:1.0.0');
      autoReplace.doAutoReplace.mockResolvedValueOnce('my-new-dep:1.0.0');

      await getUpdatedPackageFiles(config);

      expect(pep621.updateArtifacts).toHaveBeenCalledOnce();
      expect(poetry.updateArtifacts).toHaveBeenCalledOnce();
    });

    describe('when some artifacts have changed and others have not', () => {
      const pushGemUpgrade = (opts: Partial<BranchUpgradeConfig>) =>
        config.upgrades.push({
          packageFile: 'Gemfile',
          lockFiles: ['Gemfile.lock'],
          branchName: '',
          manager: 'bundler',
          ...opts,
        });

      const mockUpdated = () => {
        bundler.updateLockedDependency.mockReturnValueOnce({
          status: 'updated',
          files: { Gemfile: 'new contents' },
        });
      };

      const mockUnsupported = () => {
        bundler.updateLockedDependency.mockReturnValueOnce({
          status: 'unsupported',
        });
      };

      beforeEach(() => {
        git.getFile.mockResolvedValue('existing content');
      });

      describe('updated lockfile + unsupported lockfile', () => {
        it('only writes changed contents', async () => {
          pushGemUpgrade({ depName: 'flipper', isLockfileUpdate: true });
          mockUpdated();

          pushGemUpgrade({ depName: 'flipper-redis', isLockfileUpdate: true });
          mockUnsupported();

          await getUpdatedPackageFiles(config);
          expect(bundler.updateArtifacts).toHaveBeenCalledOnce();
          expect(bundler.updateArtifacts).toHaveBeenCalledWith(
            expect.objectContaining({ newPackageFileContent: 'new contents' }),
          );
        });
      });

      describe('unsupported lockfile + updated lockfile', () => {
        it('only writes changed contents', async () => {
          pushGemUpgrade({ depName: 'flipper', isLockfileUpdate: true });
          mockUnsupported();

          pushGemUpgrade({ depName: 'flipper-redis', isLockfileUpdate: true });
          mockUpdated();

          await getUpdatedPackageFiles(config);
          expect(bundler.updateArtifacts).toHaveBeenCalledOnce();
          expect(bundler.updateArtifacts).toHaveBeenCalledWith(
            expect.objectContaining({ newPackageFileContent: 'new contents' }),
          );
        });
      });

      describe('lockfile update + non-lockfile update', () => {
        it('only writes changed contents', async () => {
          pushGemUpgrade({ depName: 'flipper', isLockfileUpdate: true });
          pushGemUpgrade({
            depName: 'flipper-redis',
            currentValue: "'~> 0.22.2'",
            newVersion: '0.25.4',
          });
          const newContent = "gem 'flipper-redis', '~> 0.25.0'";
          autoReplace.doAutoReplace.mockResolvedValueOnce(newContent);
          mockUnsupported();
          await getUpdatedPackageFiles(config);
          expect(bundler.updateArtifacts).toHaveBeenCalledOnce();
          expect(bundler.updateArtifacts).toHaveBeenCalledWith(
            expect.objectContaining({ newPackageFileContent: newContent }),
          );
        });
      });

      describe('non-lockfile update + lockfile update', () => {
        it('only writes changed contents', async () => {
          pushGemUpgrade({
            depName: 'flipper-redis',
            currentValue: "'~> 0.22.2'",
            newVersion: '0.25.4',
          });
          pushGemUpgrade({ depName: 'flipper', isLockfileUpdate: true });
          const newContent = "gem 'flipper-redis', '~> 0.25.0'";
          autoReplace.doAutoReplace.mockResolvedValueOnce(newContent);
          mockUnsupported();
          await getUpdatedPackageFiles(config);
          expect(bundler.updateArtifacts).toHaveBeenCalledOnce();
          expect(bundler.updateArtifacts).toHaveBeenCalledWith(
            expect.objectContaining({ newPackageFileContent: newContent }),
          );
        });
      });

      describe('remediation update + lockfile unsupported update', () => {
        it('only writes changed contents', async () => {
          pushGemUpgrade({
            depName: 'flipper-redis',
            currentValue: "'~> 0.22.2'",
            newVersion: '0.25.4',
            isRemediation: true,
          });
          mockUpdated();

          pushGemUpgrade({ depName: 'flipper', isLockfileUpdate: true });
          mockUnsupported();

          await getUpdatedPackageFiles(config);
          expect(bundler.updateArtifacts).toHaveBeenCalledOnce();
          expect(bundler.updateArtifacts).toHaveBeenCalledWith(
            expect.objectContaining({ newPackageFileContent: 'new contents' }),
          );
        });
      });

      describe('lockfile unsupported update + remediation update', () => {
        it('only writes changed contents', async () => {
          pushGemUpgrade({ depName: 'flipper', isLockfileUpdate: true });
          mockUnsupported();

          pushGemUpgrade({
            depName: 'flipper-redis',
            currentValue: "'~> 0.22.2'",
            newVersion: '0.25.4',
            isRemediation: true,
          });
          mockUpdated();

          await getUpdatedPackageFiles(config);
          expect(bundler.updateArtifacts).toHaveBeenCalledOnce();
          expect(bundler.updateArtifacts).toHaveBeenCalledWith(
            expect.objectContaining({ newPackageFileContent: 'new contents' }),
          );
        });
      });

      it('passes package files to updateArtifacts in the same order they were returned by the manager', async () => {
        config.upgrades.push({
          packageFile: 'requirements-dev.in',
          manager: 'pip-compile',
          updateType: 'replacement',
          depName: 'awscli',
          currentValue: '==1.32.86',
          newVersion: '1.32.92',
          branchName: 'renovate/aws-packages',
        });
        config.upgrades.push({
          packageFile: 'requirements.in',
          manager: 'pip-compile',
          updateType: 'replacement',
          depName: 'botocore',
          currentValue: '==1.34.86',
          newVersion: '1.34.92',
          branchName: 'renovate/aws-packages',
        });
        config.packageFiles = {
          'pip-compile': [
            {
              packageFile: 'requirement.in',
              deps: [],
            },
            {
              packageFile: 'requirements-dev.in',
              deps: [],
            },
          ],
        };

        pipCompile.updateArtifacts.mockResolvedValue([]);
        autoReplace.doAutoReplace.mockResolvedValue('new content');

        await getUpdatedPackageFiles(config);

        expect(pipCompile.updateArtifacts).toHaveBeenCalledTimes(2);
        expect(pipCompile.updateArtifacts).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ packageFileName: 'requirements.in' }),
        );
        expect(pipCompile.updateArtifacts).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ packageFileName: 'requirements-dev.in' }),
        );
      });
    });
  });
});
