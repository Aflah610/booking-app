"use client";

import { useState } from "react";
import { bookingReference } from "@/features/bookings/bookings.dto";

/** The prefix box with a live example, so the admin sees exactly what clients will be given. */
export function BookingPrefixField({ initial, nextNumber }: { initial: string; nextNumber: number }) {
  const [prefix, setPrefix] = useState(initial);
  return (
    <div>
      <label className="label" htmlFor="bookingPrefix">Booking ID prefix</label>
      <input
        className="input"
        id="bookingPrefix"
        name="bookingPrefix"
        value={prefix}
        onChange={(e) => setPrefix(e.target.value)}
        maxLength={10}
        pattern="[A-Za-z0-9_\-]*"
        placeholder="BK-"
      />
      <p className="mt-1 text-xs text-zinc-600">
        Next booking will be <strong className="text-black">{bookingReference(prefix, nextNumber)}</strong>. The number after the prefix counts up by itself.
        Changing the prefix renames every booking, old ones included.
      </p>
    </div>
  );
}
