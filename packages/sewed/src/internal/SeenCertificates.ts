/**
 * The native certificates Electron most recently asked the application about, by fingerprint.
 * Deciders see a copy of a certificate's facts and never the native object, which is what the
 * system's trust dialog needs; this keeps the last few so that dialog can be shown for one of
 * them. Bounded, oldest out first.
 */
const limit = 64;
const seen = new Map<string, Electron.Certificate>();

export const remember = (certificate: Electron.Certificate): void => {
  seen.delete(certificate.fingerprint);
  seen.set(certificate.fingerprint, certificate);
  if (seen.size <= limit) return;
  const [oldest] = seen.keys();
  if (oldest !== undefined) seen.delete(oldest);
};

export const find = (fingerprint: string): Electron.Certificate | undefined =>
  seen.get(fingerprint);
