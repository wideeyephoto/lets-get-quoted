'use client';

import { useState } from 'react';
import { rateReviewAction } from './actions';

// Five star buttons that each submit their rating to the server. Hover fills the
// stars up to the pointer for a familiar rating feel. Every star goes to the
// same next screen — the rating is the contractor's own service signal, not a
// decision about which review route the customer is allowed to take.
export default function StarPicker({ token }: { token: string }) {
  const [hover, setHover] = useState(0);

  return (
    <form className="review-stars" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="submit"
          formAction={rateReviewAction.bind(null, token, n)}
          className={`review-star${n <= hover ? ' is-on' : ''}`}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </form>
  );
}
