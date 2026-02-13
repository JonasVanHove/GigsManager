"use client";

import { useState, useEffect, useMemo } from "react";
import { Calendar as BigCalendar, momentLocalizer, View } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useAuth } from "./AuthProvider";

const localizer = momentLocalizer(moment);

interface Gig {
  id: string;
  eventName: string;
  date: string;
  isCharity: boolean;
  clientPaymentReceived: boolean;
  bandPaymentComplete: boolean;
  myPayAmount: number;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Gig;
}

interface CalendarViewProps {
  fmtCurrency: (amount: number) => string;
  onEditGig?: (gigId: string) => void;
}

export default function CalendarView({ fmtCurrency, onEditGig }: CalendarViewProps) {
  const { getAccessToken } = useAuth();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const fetchGigs = async () => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");
      const response = await fetch("/api/gigs", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      // Handle both array and object response
      const gigsArray = Array.isArray(data) ? data : (data.data ?? []);
      setGigs(gigsArray);
    } catch (error) {
      console.error("Failed to load gigs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGigs();
  }, []);

  const events: CalendarEvent[] = useMemo(() => {
    return gigs.map((gig) => {
      const gigDate = new Date(gig.date);
      return {
        id: gig.id,
        title: gig.eventName,
        start: gigDate,
        end: new Date(gigDate.getTime() + 3 * 60 * 60 * 1000), // 3 hours duration
        resource: gig,
      };
    });
  }, [gigs]);

  const eventStyleGetter = (event: CalendarEvent) => {
    const gig = event.resource;
    
    let backgroundColor = "#64748b"; // slate-500 default
    let borderColor = "#475569"; // slate-600
    
    if (gig.isCharity) {
      backgroundColor = "#ec4899"; // pink-500
      borderColor = "#db2777"; // pink-600
    } else if (gig.clientPaymentReceived && gig.bandPaymentComplete) {
      backgroundColor = "#10b981"; // emerald-500
      borderColor = "#059669"; // emerald-600
    } else if (gig.clientPaymentReceived) {
      backgroundColor = "#f59e0b"; // amber-500
      borderColor = "#d97706"; // amber-600
    }

    return {
      style: {
        backgroundColor,
        borderColor,
        borderWidth: "2px",
        borderStyle: "solid",
        borderRadius: "6px",
        color: "white",
        fontWeight: "600",
        fontSize: "13px",
        padding: "2px 6px",
      },
    };
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };

  const handleCloseModal = () => {
    setSelectedEvent(null);
  };

  const handleEditClick = () => {
    if (selectedEvent && onEditGig) {
      onEditGig(selectedEvent.id);
      handleCloseModal();
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Calendar View
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Visual timeline of your gigs
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-pink-600 bg-pink-500"></div>
          <span className="text-sm text-slate-700 dark:text-slate-300">Charity</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-emerald-600 bg-emerald-500"></div>
          <span className="text-sm text-slate-700 dark:text-slate-300">Fully Paid</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-amber-600 bg-amber-500"></div>
          <span className="text-sm text-slate-700 dark:text-slate-300">Client Paid</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-slate-600 bg-slate-500"></div>
          <span className="text-sm text-slate-700 dark:text-slate-300">Awaiting Payment</span>
        </div>
      </div>

      {/* Calendar */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="calendar-wrapper p-4">
          <BigCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: 600 }}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            eventPropGetter={eventStyleGetter}
            onSelectEvent={handleSelectEvent}
            views={["month", "week", "day", "agenda"]}
            popup
          />
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleCloseModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-700/50 dark:bg-slate-800/50">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-cyan-300">
                    {selectedEvent.resource.eventName}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {moment(selectedEvent.resource.date).format("MMMM D, YYYY [at] h:mm A")}
                  </p>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-4 p-6">
              {/* Type Badge */}
              <div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                    selectedEvent.resource.isCharity
                      ? "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  }`}
                >
                  {selectedEvent.resource.isCharity ? "Charity Event" : "Paid Gig"}
                </span>
              </div>

              {/* Payment Info */}
              {!selectedEvent.resource.isCharity && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      My Earnings
                    </span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {fmtCurrency(selectedEvent.resource.myPayAmount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Client Payment
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                        selectedEvent.resource.clientPaymentReceived
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}
                    >
                      {selectedEvent.resource.clientPaymentReceived ? "Received ✓" : "Pending"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Band Payment
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                        selectedEvent.resource.bandPaymentComplete
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}
                    >
                      {selectedEvent.resource.bandPaymentComplete ? "Complete ✓" : "Pending"}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {onEditGig && (
                  <button
                    onClick={handleEditClick}
                    className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                  >
                    View/Edit Gig
                  </button>
                )}
                <button
                  onClick={handleCloseModal}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Styles */}
      <style jsx global>{`
        .calendar-wrapper .rbc-calendar {
          font-family: inherit;
        }
        
        .calendar-wrapper .rbc-header {
          padding: 12px 4px;
          font-weight: 600;
          color: #475569;
          background: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
        }
        
        .dark .calendar-wrapper .rbc-header {
          color: #cbd5e1;
          background: #1e293b;
          border-bottom-color: #334155;
        }
        
        .calendar-wrapper .rbc-today {
          background-color: #f0f9ff;
        }
        
        .dark .calendar-wrapper .rbc-today {
          background-color: #0c4a6e;
        }
        
        .calendar-wrapper .rbc-off-range-bg {
          background: #f8fafc;
        }
        
        .dark .calendar-wrapper .rbc-off-range-bg {
          background: #0f172a;
        }
        
        .calendar-wrapper .rbc-date-cell {
          padding: 6px;
          font-weight: 500;
        }
        
        .calendar-wrapper .rbc-event {
          border-radius: 6px;
          padding: 2px 6px;
        }
        
        .calendar-wrapper .rbc-toolbar button {
          color: #475569;
          border-color: #cbd5e1;
          background: white;
          font-weight: 500;
          padding: 6px 12px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        
        .dark .calendar-wrapper .rbc-toolbar button {
          color: #cbd5e1;
          border-color: #475569;
          background: #1e293b;
        }
        
        .calendar-wrapper .rbc-toolbar button:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        
        .dark .calendar-wrapper .rbc-toolbar button:hover {
          background: #334155;
          border-color: #64748b;
        }
        
        .calendar-wrapper .rbc-toolbar button.rbc-active {
          background: #0ea5e9;
          color: white;
          border-color: #0284c7;
        }
        
        .dark .calendar-wrapper .rbc-toolbar button.rbc-active {
          background: #0ea5e9;
          border-color: #0284c7;
        }
        
        .calendar-wrapper .rbc-month-view,
        .calendar-wrapper .rbc-time-view {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .dark .calendar-wrapper .rbc-month-view,
        .dark .calendar-wrapper .rbc-time-view {
          border-color: #334155;
        }
      `}</style>
    </div>
  );
}
