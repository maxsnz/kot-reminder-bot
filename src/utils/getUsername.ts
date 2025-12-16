export const getUsername = (from: { id: number; username?: string | null }) => {
  if (from.username) {
    return from.username;
  }

  return `user_${from.id}`;
};

export const getFullName = (from: {
  first_name?: string | null;
  last_name?: string | null;
}) => {
  if (from.first_name && from.last_name) {
    return `${from.first_name} ${from.last_name}`;
  }
  if (from.first_name && from.last_name) {
    return `${from.first_name} ${from.last_name}`;
  }
  if (from.first_name) {
    return from.first_name;
  }
  if (from.last_name) {
    return from.last_name;
  }
  return "";
};
