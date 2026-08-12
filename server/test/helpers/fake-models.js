export function query(value) {
  let current = value;
  const chain = {
    select() {
      return chain;
    },
    sort(specification) {
      if (Array.isArray(current) && specification) {
        current = [...current].sort((left, right) => {
          for (const [field, direction] of Object.entries(specification)) {
            const a = left?.[field] instanceof Date ? left[field].getTime() : left?.[field];
            const b = right?.[field] instanceof Date ? right[field].getTime() : right?.[field];
            if (a === b) continue;
            return (a < b ? -1 : 1) * Number(direction);
          }
          return 0;
        });
      }
      return chain;
    },
    limit(valueLimit) {
      if (Array.isArray(current)) current = current.slice(0, valueLimit);
      return chain;
    },
    lean() {
      return Promise.resolve(current);
    },
    exec() {
      return Promise.resolve(current);
    },
    then(resolve, reject) {
      return Promise.resolve(current).then(resolve, reject);
    },
  };
  return chain;
}

export function sameId(left, right) {
  return String(left?._id ?? left?.id ?? left) === String(right?._id ?? right?.id ?? right);
}

export function matches(document, filter) {
  if (!document) return false;
  return Object.entries(filter ?? {}).every(([field, expected]) => {
    if (field === '$or') return expected.some((branch) => matches(document, branch));
    const actual = document[field];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$lt' in expected && !(actual < expected.$lt)) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      return true;
    }
    return sameId(actual, expected);
  });
}
