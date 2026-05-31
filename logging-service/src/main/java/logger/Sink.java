package logger;

public interface Sink extends AutoCloseable {
    void write(String formatted);
    
    @Override
    default void close() throws Exception {
        // Optional clean up
    }
}
