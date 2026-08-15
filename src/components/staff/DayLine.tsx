import { useTranslations } from 'next-intl';

import {
  formatMinute,
  hourTicks,
  isRequest,
  layOutDay,
  positionOf,
  type ConsoleAppointment,
  type TimeWindow,
} from '@/lib/console/day-line';
import { cn } from '@/lib/utils';
import { AppointmentDetail } from './AppointmentDetail';

/**
 * §13's signature view: three lanes on one timeline.
 *
 * "Today all three businesses share one phone and exist only in someone's memory — this view
 * puts the whole operation in a single glance."
 *
 * Two departures from the design, both required by the brief rather than chosen:
 *
 * The axis is not 09:00–19:00. Opening hours are unknown (§6), so it is derived — from
 * `business_hours` when that table is filled in, and otherwise from the appointments actually in
 * the book. An axis that asserted hours would put a closed sign on a day the salon worked.
 *
 * Requests are not blocks. Most bookings are requests today, because durations are unknown and a
 * booking without one holds no slot. Drawing them on the grid would give them a width — a length
 * nobody supplied — and a position implying a commitment nobody made. They sit under the lane
 * instead, at the time the client asked for.
 *
 * Positions are percentages with logical properties, so Arabic reverses the whole timeline for
 * free rather than through mirrored arithmetic.
 */
export function DayLine({
  appointments,
  window,
}: {
  appointments: ConsoleAppointment[];
  window: TimeWindow;
}) {
  const t = useTranslations('console.dayLine');
  const lanes = layOutDay(appointments);
  const ticks = hourTicks(window);

  return (
    <div className="flex flex-col gap-3">
      {/* The ruler. aria-hidden because every block states its own time in text. */}
      <div aria-hidden className="relative h-5 ps-[104px]">
        <div className="relative h-full">
          {ticks.map((tick) => (
            <span
              key={tick.minute}
              className="absolute top-0 -translate-x-1/2 text-[11px] tabular-nums text-taupe rtl:translate-x-1/2"
              style={{ insetInlineStart: `${tick.offset * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {lanes.map((lane) => (
          <section
            key={lane.line}
            aria-labelledby={`lane-${lane.line}`}
            className="rounded-[16px] border border-line bg-white p-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <h3
                id={`lane-${lane.line}`}
                className="w-[92px] shrink-0 text-[12px] uppercase tracking-[.16em] text-taupe"
              >
                {t(`lines.${lane.line}`)}
              </h3>

              <div className="relative min-w-0 flex-1">
                {lane.rows.length === 0 && lane.requests.length === 0 ? (
                  <p className="py-2 text-[13px] text-muted-3">{t('laneEmpty')}</p>
                ) : null}

                {/* Faint hour gridlines, so a block's position is readable without counting. */}
                {lane.rows.length > 0 ? (
                  <div aria-hidden className="pointer-events-none absolute inset-0">
                    {ticks.map((tick) => (
                      <span
                        key={tick.minute}
                        className="absolute top-0 h-full border-s border-line/70"
                        style={{ insetInlineStart: `${tick.offset * 100}%` }}
                      />
                    ))}
                  </div>
                ) : null}

                <div className="relative flex flex-col gap-1.5">
                  {lane.rows.map((row, index) => (
                    <div key={index} className="relative h-[52px]">
                      {row.map((appointment) => (
                        <Block
                          key={appointment.id}
                          appointment={appointment}
                          window={window}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {lane.requests.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-dashed border-champagne/70 pt-2">
                    <p className="text-[11px] uppercase tracking-[.14em] text-taupe">
                      {t('requestsHeading', { count: lane.requests.length })}
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {lane.requests.map((appointment) => (
                        <li key={appointment.id}>
                          <AppointmentDetail appointment={appointment}>
                            <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-champagne bg-champagne-3/70 px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:border-rose-deep">
                              <span className="tabular-nums" dir="ltr">
                                {formatMinute(appointment.startMinute)}
                              </span>
                              <span>{appointment.clientName}</span>
                            </span>
                          </AppointmentDetail>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Block({
  appointment,
  window,
}: {
  appointment: ConsoleAppointment;
  window: TimeWindow;
}) {
  const { offset, width } = positionOf(appointment, window);
  if (isRequest(appointment) || width === null) return null;

  return (
    <div
      className="absolute top-0 h-full"
      style={{
        insetInlineStart: `${offset * 100}%`,
        // A very short appointment still needs to be clickable.
        width: `max(${width * 100}%, 76px)`,
      }}
    >
      <AppointmentDetail appointment={appointment}>
        <span
          className={cn(
            'flex h-full w-full flex-col justify-center overflow-hidden rounded-[12px] border px-2.5 py-1 text-start transition-colors',
            appointment.status === 'confirmed'
              ? 'border-rose-soft/60 bg-blush-6 hover:border-rose-deep'
              : appointment.status === 'completed'
                ? 'border-muted-2 bg-cream hover:border-rose-deep'
                : 'border-champagne/70 bg-champagne-3 hover:border-rose-deep',
          )}
        >
          <span className="truncate text-[12px] leading-tight text-charcoal">
            {appointment.clientName}
          </span>
          <span className="truncate text-[11px] leading-tight text-taupe-2">
            {appointment.serviceName ?? appointment.gownName ?? '—'}
          </span>
        </span>
      </AppointmentDetail>
    </div>
  );
}
