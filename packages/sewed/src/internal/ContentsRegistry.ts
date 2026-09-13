/** Maps a native WebContents id to the Sewed handle that owns it, for request attribution. */
const owners = new Map<number, string>();

export const register = (contentsId: number, handleId: string): (() => void) => {
  owners.set(contentsId, handleId);
  return () => {
    if (owners.get(contentsId) === handleId) owners.delete(contentsId);
  };
};

export const handleIdOf = (contentsId: number | undefined): string | undefined =>
  contentsId === undefined ? undefined : owners.get(contentsId);
