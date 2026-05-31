package logger;

public enum QueueBackpressurePolicy {
    BLOCK,
    DROP_NEWEST,
    DROP_OLDEST,
    THROW
}
