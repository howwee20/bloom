export interface DailyItem {
  id: string;
  title: string;
  source: "youtube";
  url: string;
  thumb: string;
  duration?: string;
  rank?: number;
}

export interface DailyPayload {
  date: string;
  items: DailyItem[];
}

// Tests are intentionally skipped for now because this project does not ship with a test runner.
export class DailyNotFoundError extends Error {
  previousDate?: string;

  constructor(previousDate?: string) {
    super("Daily feed not found");
    this.name = "DailyNotFoundError";
    this.previousDate = previousDate;
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function parseResponse(
  response: Response,
  fallbackDate: string,
): Promise<DailyPayload> {
  const data = await response
    .json()
    .catch(() => ({ date: fallbackDate, items: [] }));
  const date = typeof data?.date === "string" ? data.date : fallbackDate;
  const items = Array.isArray(data?.items) ? data.items : [];
  return { date, items };
}

export async function getDaily(): Promise<DailyPayload> {
  const today = new Date();
  const fallbackDate = formatDate(new Date(today.getTime() - 24 * 60 * 60 * 1000));

  const todayResponse = await fetch("/daily/today.json", {
    cache: "no-store",
  }).catch(() => undefined);

  if (todayResponse?.ok) {
    return parseResponse(todayResponse, formatDate(today));
  }

  const fallbackResponse = await fetch(`/daily/${fallbackDate}.json`, {
    cache: "no-store",
  }).catch(() => undefined);

  if (fallbackResponse?.ok) {
    return parseResponse(fallbackResponse, fallbackDate);
  }

  throw new DailyNotFoundError(fallbackDate);
}
