export interface CountryOption {
  /** ISO 3166-1 alpha-2 code, as the License Portal expects. */
  code: string;
  name: string;
  regions: string[];
}

let countries: Promise<CountryOption[]> | null = null;

/** Loads the country and state list on first use, so it is not part of the initial bundle. */
export function loadCountries(): Promise<CountryOption[]> {
  countries ??= import('country-region-data')
    .then(({ allCountries }: { allCountries: [string, string, [string, string?][]][] }) =>
      allCountries
        .map(([name, code, regions]) => ({ code, name, regions: regions.map(([region]) => region) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
    .catch((error: unknown) => {
      countries = null;
      throw error;
    });
  return countries;
}

