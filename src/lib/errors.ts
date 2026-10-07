import { tr } from '@/lib/i18n';

/**
 * Turns raw network and database errors into words a member can act on, in the member's language.
 * Messages we wrote ourselves in the database (raised with a plain sentence) pass through as written;
 * anything technical becomes a short, plain explanation.
 */
export function friendlyError(raw: string | null | undefined): string {
  const message = (raw ?? '').replace(/^P0001:\s*/, '').trim();
  if (!message) return tr('s_errGeneric');
  if (/JSON object requested|multiple \(or no\) rows|PGRST116/i.test(message)) return tr('s_errNotFound');
  if (/Failed to fetch|Network request failed|NetworkError|Load failed|timed? ?out|fetch failed/i.test(message)) return tr('s_errOffline');
  if (/mime type|not supported|content type/i.test(message)) return tr('s_errFileType');
  if (/exceeded the maximum allowed size|Payload too large|too large|413/i.test(message)) return tr('s_errTooBig');
  if (/JWT|not authorized|permission denied|row-level security|violates row-level/i.test(message)) return tr('s_errNoAccess');
  if (/violates|constraint|syntax|relation|column|function .* does not exist|internal|unexpected|TypeError|undefined|null value/i.test(message))
    return tr('s_errServer');
  // Our own messages are full sentences ("Too many codes. Try again in an hour.").
  return message;
}
