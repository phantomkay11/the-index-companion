/**
 * Turns raw network and database errors into words a member can act on.
 * Messages we wrote ourselves in the database (raised with a plain sentence) pass through;
 * anything technical becomes a short, plain explanation.
 */
export function friendlyError(raw: string | null | undefined): string {
  const message = (raw ?? '').replace(/^P0001:\s*/, '').trim();
  if (!message) return 'Something went wrong. Try again in a moment.';
  if (/JSON object requested|multiple \(or no\) rows|PGRST116/i.test(message)) return 'We couldn’t find that. It may have been removed or is no longer public.';
  if (/Failed to fetch|Network request failed|NetworkError|Load failed|timed? ?out|fetch failed/i.test(message))
    return 'You’re offline or the connection dropped. Try again when you have signal.';
  if (/mime type|not supported|content type/i.test(message)) return 'That kind of file can’t be uploaded here. Use a photo (JPEG, PNG, WebP or HEIC).';
  if (/exceeded the maximum allowed size|Payload too large|too large|413/i.test(message)) return 'That file is too big. Try a smaller photo or a shorter recording.';
  if (/JWT|not authorized|permission denied|row-level security|violates row-level/i.test(message)) return 'You don’t have access to do that. Try signing in again.';
  if (/violates|constraint|syntax|relation|column|function .* does not exist|internal|unexpected|TypeError|undefined|null value/i.test(message))
    return 'Something went wrong on our side. Try again in a moment.';
  // Our own messages are full sentences ("Too many codes. Try again in an hour.").
  return message;
}
