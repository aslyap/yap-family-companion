import { supabase } from './supabaseClient';

// Returns { maddie: { points_balance, redeemed_points }, alex: { ... } }
export async function fetchRewards() {
  const { data, error } = await supabase
    .from('rewards')
    .select('person, points_balance, redeemed_points')
    .in('person', ['maddie', 'alex']);
  if (error) throw error;

  const result = { maddie: null, alex: null };
  (data ?? []).forEach(row => {
    if (row.person === 'maddie' || row.person === 'alex') {
      result[row.person] = {
        points_balance: row.points_balance ?? 0,
        redeemed_points: row.redeemed_points ?? 0,
      };
    }
  });
  return result;
}
