import fetch from 'npm-registry-fetch';
import fs from 'fs';
import path from 'path';
import { Presets, SingleBar } from 'cli-progress';

// Ensure the orgName is provided as a command-line argument
const orgName = process.argv[2];
if (!orgName) {
  console.error('Please provide the organization name as a command-line argument.');
  process.exit(1);
}

// Function to get npm token from ~/.npmrc
const getNpmToken = (): string | null => {
  try {
    const npmrcPath = path.resolve(process.env.HOME || process.env.USERPROFILE || '', '.npmrc');
    const npmrcContent = fs.readFileSync(npmrcPath, 'utf-8');
    const match = npmrcContent.match(/\/\/registry\.npmjs\.org\/:_authToken=(.*)/);
    return match ? match[1].trim() : null;
  } catch (error) {
    console.error('Failed to read npm token from ~/.npmrc:', error);
    return null;
  }
};

const npmToken = getNpmToken();
if (!npmToken) {
  console.error('Failed to retrieve npm token from ~/.npmrc');
  process.exit(1);
}

const fetchOpts = {
  headers: {
    Authorization: `Bearer ${npmToken}`
  },
  registry: 'https://registry.npmjs.org/'
};

interface PackageSizeInfo {
  name: string;
  size: string;
}

// Type guard to check if an error is an instance of Error
const isError = (error: unknown): error is Error => {
  return error instanceof Error;
};

// Function to format bytes as a human-readable string
const formatBytes = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

const getPackageSize = async (packageName: string): Promise<PackageSizeInfo | null> => {
  try {
    const encodedPackageName = encodeURIComponent(packageName);
    const packageInfoUrl = `https://registry.npmjs.org/${encodedPackageName}`;
    const packageInfo = await fetch.json(packageInfoUrl, fetchOpts) as Record<string, any>;

    const latest = packageInfo['dist-tags']?.latest;
    if (!latest) {
      return null;
    }

    const versionInfo = packageInfo.versions[latest];
    const size = versionInfo?.dist?.unpackedSize;
    if (typeof size !== 'number') {
      return null;
    }

    return {
      name: packageName,
      size: formatBytes(size)
    };
  } catch (error) {
    if (isError(error)) {
      if (error.message.includes('404')) {
        console.error(`Package ${packageName} not found (404)`);
      } else {
        console.error(`Failed to fetch size for package ${packageName}: ${error.message}`);
      }
    } else {
      console.error(`Failed to fetch size for package ${packageName}: An unknown error occurred.`);
    }
    return null;
  }
};

const listOrgPackages = async (org: string): Promise<string[]> => {
  try {
    const orgPackagesUrl = `https://registry.npmjs.org/-/org/${org}/package`;
    const response = await fetch.json(orgPackagesUrl, fetchOpts) as Record<string, unknown>;
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      return Object.keys(response);
    } else {
      throw new Error('Unexpected response format');
    }
  } catch (error) {
    if (isError(error)) {
      console.error(`Failed to list packages for org ${org}: ${error.message}`);
    } else {
      console.error(`Failed to list packages for org ${org}: An unknown error occurred.`);
    }
    return [];
  }
};

const main = async () => {
  try {
    const packages = await listOrgPackages(orgName);
    const bar = new SingleBar({ clearOnComplete: true }, Presets.shades_classic);
    bar.start(packages.length, 0);

    const packageSizesPromises = packages.map(pkg => getPackageSize(pkg).finally(() => bar.increment()));
    const packageSizesResults = await Promise.all(packageSizesPromises);
    bar.stop()


    const packageSizes: PackageSizeInfo[] = packageSizesResults.filter(
      (sizeInfo): sizeInfo is PackageSizeInfo => sizeInfo !== null
    );

    console.table(packageSizes);
  } catch (error) {
    if (isError(error)) {
      console.error('Error during processing:', error.message);
    } else {
      console.error('Error during processing: An unknown error occurred.');
    }
  }
};

main();
