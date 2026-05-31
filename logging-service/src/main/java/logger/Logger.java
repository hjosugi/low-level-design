package logger;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.locks.ReentrantLock;
import lombok.Getter;

public class Logger {
    @Getter
    private final String name;
    @Getter
    private final Logger parent;
    private final List<Destination> destinations = new CopyOnWriteArrayList<>();
    @Getter
    private volatile boolean propagate = true;

    // Double-checked volatile cache for aggregated parent chain destinations
    private volatile List<Destination> cachedDestinations = null;
    private final ReentrantLock cacheLock = new ReentrantLock();

    public Logger(String name, Logger parent) {
        this.name = name;
        this.parent = parent;
    }



    public void setPropagate(boolean propagate) {
        this.propagate = propagate;
        invalidateCache();
    }

    public List<Destination> getDestinations() {
        return new ArrayList<>(destinations);
    }

    public void addDestination(Destination destination) {
        if (destination != null) {
            destinations.add(destination);
            invalidateCache();
        }
    }

    public void invalidateCache() {
        cacheLock.lock();
        try {
            cachedDestinations = null;
        } finally {
            cacheLock.unlock();
        }
    }

    public void log(LogLevel level, String message) {
        if (message == null) {
            message = "null";
        }
        
        double timestamp = System.currentTimeMillis() / 1000.0;
        String threadName = Thread.currentThread().getName();

        // Create immutable LogRecord
        LogRecord record = new LogRecord(
            timestamp,
            level,
            message,
            threadName,
            this.name
        );

        // Broadcast to UI event bus
        EventBus.emit("log_emitted", Map.of(
            "logger", this.name,
            "level", level.name(),
            "message", message,
            "thread", threadName,
            "timestamp", timestamp
        ));

        // Get effective destinations list (using performance-optimized cache)
        List<Destination> activeDests = getEffectiveDestinations();

        // Sequential dispatch on calling thread
        for (Destination d : activeDests) {
            d.write(record);
        }
    }

    private List<Destination> getEffectiveDestinations() {
        // 1. Fast read (volatile read)
        List<Destination> result = cachedDestinations;
        if (result != null) {
            return result;
        }

        // 2. Slow path: Acquire lock
        cacheLock.lock();
        try {
            // Double check
            result = cachedDestinations;
            if (result == null) {
                List<Destination> aggregated = new ArrayList<>();
                Logger curr = this;
                
                while (curr != null) {
                    aggregated.addAll(curr.destinations);
                    if (!curr.propagate) {
                        break;
                    }
                    curr = curr.parent;
                }

                // De-duplicate aggregated destinations to prevent double logging
                List<Destination> unique = new ArrayList<>();
                for (Destination d : aggregated) {
                    if (!unique.contains(d)) {
                        unique.add(d);
                    }
                }
                
                cachedDestinations = unique;
                result = unique;
            }
            return result;
        } finally {
            cacheLock.unlock();
        }
    }

    // Convenience log wrappers
    public void debug(String message) {
        log(LogLevel.DEBUG, message);
    }

    public void info(String message) {
        log(LogLevel.INFO, message);
    }

    public void warn(String message) {
        log(LogLevel.WARN, message);
    }

    public void error(String message) {
        log(LogLevel.ERROR, message);
    }

    public void fatal(String message) {
        log(LogLevel.FATAL, message);
    }
}
