package logger;

import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;
import lombok.Getter;

public class Destination implements AutoCloseable {
    private static final AtomicInteger idCounter = new AtomicInteger(0);
    
    // Sentinel to gracefully shut down the worker thread
    private static final LogRecord SHUTDOWN_SENTINEL = new LogRecord(0, LogLevel.DEBUG, "SHUTDOWN", "SHUTDOWN", "SHUTDOWN");

    @Getter
    private final String id;
    @Getter
    private final Formatter formatter;
    @Getter
    private final LogLevel minLevel;
    @Getter
    private final Sink sink;
    
    @Getter
    private final boolean asyncMode;
    @Getter
    private final int queueCapacity;
    @Getter
    private final QueueBackpressurePolicy backpressurePolicy;
    
    private final ReentrantLock lock = new ReentrantLock();
    
    // Async fields
    private BlockingQueue<LogRecord> queue;
    private Thread worker;
    private volatile boolean running = false;

    public static class QueueFullException extends RuntimeException {
        public QueueFullException(String message) {
            super(message);
        }
    }

    /**
     *  
     */
    public Destination(
        Formatter formatter,
        LogLevel minLevel,
        Sink sink,
        boolean asyncMode,
        int queueCapacity,
        QueueBackpressurePolicy backpressurePolicy
    ) {
        this.id = "dest_" + idCounter.incrementAndGet();
        this.formatter = formatter;
        this.minLevel = minLevel;
        this.sink = sink;
        this.asyncMode = asyncMode;
        this.queueCapacity = queueCapacity;
        this.backpressurePolicy = backpressurePolicy == null ? QueueBackpressurePolicy.BLOCK : backpressurePolicy;

        if (this.asyncMode) {
            this.queue = new ArrayBlockingQueue<>(this.queueCapacity);
            this.running = true;
            this.worker = new Thread(this::workerLoop);
            this.worker.setName("LoggerWorker-" + this.id);
            this.worker.setDaemon(true);
            this.worker.start();
        }
    }

    public int getQueueSize() {
        return queue != null ? queue.size() : 0;
    }

    public void write(LogRecord record) {
        // 1. Threshold Level Filter
        if (record.level().getValue() < this.minLevel.getValue()) {
            EventBus.emit("log_filtered", Map.of(
                "dest_id", this.id,
                "record_level", record.level().name(),
                "min_level", this.minLevel.name(),
                "message", record.message(),
                "logger", record.loggerName()
            ));
            return;
        }

        // Emit processing start telemetry
        EventBus.emit("log_process", Map.of(
            "dest_id", this.id,
            "message", record.message(),
            "level", record.level().name(),
            "thread", record.threadName(),
            "logger", record.loggerName(),
            "async", this.asyncMode
        ));

        if (this.asyncMode) {
            enqueue(record);
        } else {
            writeToSink(record);
        }
    }

    private void enqueue(LogRecord record) {
        // Check if queue is full
        if (queue.remainingCapacity() == 0) {
            EventBus.emit("queue_overflow", Map.of(
                "dest_id", this.id,
                "policy", this.backpressurePolicy.name(),
                "message", record.message(),
                "thread", Thread.currentThread().getName()
            ));

            switch (this.backpressurePolicy) {
                case DROP_NEWEST:
                    System.err.println("Logger warning: Queue full (" + queueCapacity + "). Dropped newest record: " + record.message());
                    System.err.flush();
                    EventBus.emit("sink_write", Map.of(
                        "sink", "Stderr",
                        "target", "stderr",
                        "text", "WARNING: Queue full (" + queueCapacity + "). Dropped newest record: " + record.message()
                    ));
                    return;

                case DROP_OLDEST:
                    synchronized (queue) {
                        LogRecord dropped = queue.poll();
                        if (dropped != null) {
                            EventBus.emit("log_dropped_oldest", Map.of(
                                "dest_id", this.id,
                                "dropped_message", dropped.message()
                            ));
                        }
                        queue.offer(record);
                    }
                    emitQueueStatus();
                    return;

                case THROW:
                    throw new QueueFullException("Logger Queue full (" + queueCapacity + ")");

                case BLOCK:
                default:
                    long startTime = System.currentTimeMillis();
                    EventBus.emit("thread_blocked", Map.of(
                        "dest_id", this.id,
                        "thread", Thread.currentThread().getName()
                    ));
                    try {
                        queue.put(record);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                    double blockedDuration = (System.currentTimeMillis() - startTime) / 1000.0;
                    EventBus.emit("thread_unblocked", Map.of(
                        "dest_id", this.id,
                        "thread", Thread.currentThread().getName(),
                        "blocked_duration", blockedDuration
                    ));
                    emitQueueStatus();
                    return;
            }
        }

        // Space is available, offer directly
        queue.offer(record);
        emitQueueStatus();
    }

    private void writeToSink(LogRecord record) {
        // Serialization runs outside the lock because formatters are stateless/immutable
        String formatted = formatter.format(record);

        String threadName = Thread.currentThread().getName();
        EventBus.emit("lock_wait", Map.of(
            "dest_id", this.id,
            "thread", threadName
        ));

        lock.lock();
        try {
            EventBus.emit("lock_acquired", Map.of(
                "dest_id", this.id,
                "thread", threadName
            ));
            sink.write(formatted);
        } catch (Exception e) {
            System.err.println("Logger error writing to sink: " + e.getMessage());
            System.err.flush();
            EventBus.emit("sink_write", Map.of(
                "sink", "Stderr",
                "target", "stderr",
                "text", "ERROR writing to sink: " + e.getMessage()
            ));
        } finally {
            lock.unlock();
            EventBus.emit("lock_released", Map.of(
                "dest_id", this.id,
                "thread", threadName
            ));
        }
    }

    private void workerLoop() {
        while (running || !queue.isEmpty()) {
            try {
                LogRecord record = queue.poll(100, TimeUnit.MILLISECONDS);
                if (record == SHUTDOWN_SENTINEL) {
                    break;
                }
                if (record != null) {
                    writeToSink(record);
                    emitQueueStatus();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                System.err.println("Logger async worker error: " + e.getMessage());
            }
        }
    }

    private void emitQueueStatus() {
        if (queue != null) {
            EventBus.emit("queue_status", Map.of(
                "dest_id", this.id,
                "size", queue.size(),
                "capacity", this.queueCapacity
            ));
        }
    }

    @Override
    public void close() throws Exception {
        if (this.asyncMode && this.running) {
            this.running = false;
            if (this.queue != null) {
                // Try sending sentinel
                queue.offer(SHUTDOWN_SENTINEL, 1, TimeUnit.SECONDS);
            }
            if (this.worker != null) {
                this.worker.join(2000);
            }
        }
        sink.close();
    }
}
